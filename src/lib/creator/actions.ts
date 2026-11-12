// What a creator can do to their own baskets, shared by the website's routes (session cookie) and the MCP server
// (agent key), so both follow exactly the same rules. Validation problems come back as `errors`; anything else
// (not yours, not found, too many) throws an HttpError.
import "server-only";
import { and, count, eq, gte, like, or } from "drizzle-orm";
import { db, schema } from "@/db";
import { HttpError } from "@/lib/auth/session";
import { sanitizeAgentConfig } from "@/lib/agent/config";
import { agentAssetProblem, minBuyUsd, RULES } from "@/lib/basket-rules";
import { createProblems, EDITABLE_FIELDS, markdownProblems, PatchBasketSchema, slugify } from "@/lib/basket-text";
import { revalidateBasket, revalidateProfiles } from "@/lib/basket-pages";
import { platformFeeBpsFor } from "@/lib/baskets";
import { isAdmin, loadOwnBasket, type UserRow } from "@/lib/users";

export type Result<T> = { ok: true; value: T } | { ok: false; errors: string[] };
const invalid = (errors: string[]): Result<never> => ({ ok: false, errors });

async function uniqueSlug(base: string): Promise<string> {
  const taken = new Set(
    (
      await db()
        .select({ slug: schema.baskets.slug })
        .from(schema.baskets)
        .where(or(eq(schema.baskets.slug, base), like(schema.baskets.slug, `${base}-%`)))
    ).map((r) => r.slug),
  );
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
}

/**
 * Create a basket. Normal creators get status "pending": it goes live after their self-buy (the trading track flips
 * it). Admins may publish a House basket straight to "live" without a self-buy, but only from the website
 * (`allowHouse`), never through an agent key.
 */
export async function createBasket(user: UserRow, body: unknown, opts: { allowHouse: boolean }) {
  const { errors, data } = createProblems(body);
  if (!data) return invalid(errors);
  // Agent-managed: the creator's strategy and limits. The strategy stays private to the creator and the agent.
  const rawAgent = (body as { agent?: unknown } | null)?.agent;
  let agent = null;
  const agentProblem = rawAgent ? agentAssetProblem(data.assets.map((a) => a.assetId)) : null;
  if (agentProblem) return invalid([agentProblem]);
  try {
    agent = rawAgent ? sanitizeAgentConfig(rawAgent, data.assets) : null;
  } catch (e) {
    return invalid([(e as Error).message]);
  }

  const admin = isAdmin(user);
  // Spam guard: a few new baskets per creator per day. Pending baskets cost nothing on-chain, but they clutter.
  if (!admin) {
    const [{ n }] = await db()
      .select({ n: count() })
      .from(schema.baskets)
      .where(and(eq(schema.baskets.creatorId, user.id), gte(schema.baskets.createdAt, new Date(Date.now() - 24 * 3600_000))));
    if (n >= RULES.maxBasketsPerDay) throw new HttpError(429, `You can create up to ${RULES.maxBasketsPerDay} baskets a day. Try again tomorrow.`);
  }
  if (data.house && !(admin && opts.allowHouse)) throw new HttpError(403, opts.allowHouse ? "Only admins can publish House baskets." : "House baskets can only be published from the website.");
  const house = Boolean(data.house && admin && opts.allowHouse);

  // Unique slug; retry once if a concurrent create took it between the check and the insert.
  for (let attempt = 0; attempt < 3; attempt++) {
    const slug = await uniqueSlug(slugify(data.name));
    try {
      const basket = await db().transaction(async (tx) => {
        const [row] = await tx
          .insert(schema.baskets)
          .values({
            slug,
            creatorId: user.id,
            name: data.name,
            tagline: data.tagline,
            thesis: data.thesis,
            risks: data.risks,
            horizon: data.horizon,
            exitSignal: data.exitSignal ?? null,
            deepDive: data.deepDive ?? null,
            feeBps: data.feeBps,
            agent,
            isHouse: house,
            status: house ? "live" : "pending",
            publishedAt: house ? new Date() : null,
          })
          .returning();
        await tx.insert(schema.basketAssets).values(data.assets.map((a) => ({ basketId: row.id, assetId: a.assetId, weightBps: a.weightBps, why: a.why })));
        return row;
      });
      revalidateBasket(slug);
      revalidateProfiles();
      const weights = data.assets.map(({ assetId, weightBps }) => ({ assetId, weightBps }));
      return {
        ok: true as const,
        value: { slug: basket.slug, id: basket.id, status: basket.status, minBuyUsd: minBuyUsd(weights, data.feeBps + platformFeeBpsFor(Boolean(agent))) },
      };
    } catch (e) {
      const err = e as { code?: string; cause?: { code?: string } };
      if ((err.code ?? err.cause?.code) === "23505" && attempt < 2) continue; // unique_violation on slug
      throw e;
    }
  }
  throw new HttpError(409, "Couldn't reserve a link for that name. Try again.");
}

/**
 * Edit a basket's text after publish. Creator only. Name, assets, weights and fee never change. Every changed field
 * is logged to basket_edits and shown publicly on the basket page.
 */
export async function editBasket(userId: number, slug: string, body: unknown): Promise<Result<{ changed: string[] }>> {
  const p = PatchBasketSchema.safeParse(body);
  if (!p.success) return invalid([...new Set(p.error.issues.map((i) => i.message))]);
  const patch = p.data;
  const basket = await loadOwnBasket(slug, userId);

  const errors = [...(patch.thesis ? markdownProblems("Thesis", patch.thesis) : []), ...(patch.deepDive ? markdownProblems("Deep dive", patch.deepDive) : [])];
  const assets = await db().select().from(schema.basketAssets).where(eq(schema.basketAssets.basketId, basket.id));
  const byAsset = new Map(assets.map((a) => [a.assetId, a]));
  for (const id of Object.keys(patch.why ?? {})) if (!byAsset.has(id)) errors.push(`${id} isn't in this basket.`);
  if (errors.length) return invalid(errors);

  const changes: { field: string; oldValue: string | null; newValue: string | null }[] = [];
  // Required fields (tagline, thesis, risks) can't be null: the schema rejects empty strings for them.
  const set: Partial<Pick<typeof schema.baskets.$inferInsert, (typeof EDITABLE_FIELDS)[number]>> = {};
  for (const f of EDITABLE_FIELDS) {
    const next = patch[f];
    if (next === undefined) continue;
    const prev = basket[f] ?? null;
    if ((next ?? null) === prev) continue;
    (set as Record<string, string | null>)[f] = next ?? null;
    changes.push({ field: f, oldValue: prev, newValue: next ?? null });
  }
  const whyChanges = Object.entries(patch.why ?? {}).filter(([id, v]) => byAsset.get(id)!.why !== v);
  for (const [id, v] of whyChanges) changes.push({ field: `why:${id}`, oldValue: byAsset.get(id)!.why, newValue: v });

  if (!changes.length) return { ok: true, value: { changed: [] } };

  await db().transaction(async (tx) => {
    if (Object.keys(set).length) await tx.update(schema.baskets).set(set).where(eq(schema.baskets.id, basket.id));
    for (const [id, v] of whyChanges) {
      await tx
        .update(schema.basketAssets)
        .set({ why: v })
        .where(and(eq(schema.basketAssets.basketId, basket.id), eq(schema.basketAssets.assetId, id)));
    }
    await tx.insert(schema.basketEdits).values(changes.map((c) => ({ basketId: basket.id, ...c })));
  });
  revalidateBasket(slug);
  return { ok: true, value: { changed: changes.map((c) => c.field) } };
}

/** Close a basket to new buyers. Creator only. Never deletes: holders keep selling and withdrawing. */
export async function closeBasket(userId: number, slug: string) {
  const basket = await loadOwnBasket(slug, userId);
  if (basket.status === "closed") return { status: "closed" as const, closedAt: basket.closedAt?.toISOString() ?? null };
  if (basket.status === "hidden") throw new HttpError(409, "This basket is hidden by an admin.");
  const [row] = await db().update(schema.baskets).set({ status: "closed", closedAt: new Date() }).where(eq(schema.baskets.id, basket.id)).returning();
  revalidateBasket(slug);
  revalidateProfiles();
  return { status: row.status, closedAt: row.closedAt?.toISOString() ?? null };
}
