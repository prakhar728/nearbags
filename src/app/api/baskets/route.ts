// Create a basket (spec §5.3). Normal creators get status "pending": it goes live after their self-buy
// (the trading track flips it). Admins may publish a House basket straight to "live" without a self-buy.
import { like, or, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { handle, HttpError, requireSession } from "@/lib/auth/session";
import { minBuyUsd } from "@/lib/basket-rules";
import { createProblems, slugify } from "@/lib/basket-text";
import { revalidateBasket, revalidateProfiles } from "@/lib/basket-pages";
import { PLATFORM_FEE_BPS } from "@/lib/baskets";
import { isAdmin, sessionUser } from "@/lib/users";
import { sanitizeAgentConfig } from "@/lib/agent/config";

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

export async function POST(request: Request) {
  return handle(async () => {
    const session = await requireSession();
    const user = await sessionUser(session);
    const body = await request.json().catch(() => null);
    const { errors, data } = createProblems(body);
    if (!data) return Response.json({ errors }, { status: 400 });
    // Agent-managed: the creator's strategy and limits. The strategy stays private to the creator and the agent.
    let agent = null;
    try {
      agent = body?.agent ? sanitizeAgentConfig(body.agent, data.assets) : null;
    } catch (e) {
      return Response.json({ errors: [(e as Error).message] }, { status: 400 });
    }

    const admin = isAdmin(user);
    if (data.house && !admin) throw new HttpError(403, "Only admins can publish House baskets.");
    const house = Boolean(data.house && admin);

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
          await tx
            .insert(schema.basketAssets)
            .values(data.assets.map((a) => ({ basketId: row.id, assetId: a.assetId, weightBps: a.weightBps, why: a.why })));
          return row;
        });
        revalidateBasket(slug);
        revalidateProfiles();
        const weights = data.assets.map(({ assetId, weightBps }) => ({ assetId, weightBps }));
        return Response.json(
          { slug: basket.slug, id: basket.id, status: basket.status, minBuyUsd: minBuyUsd(weights, data.feeBps + PLATFORM_FEE_BPS()) },
          { status: 201 },
        );
      } catch (e) {
        const err = e as { code?: string; cause?: { code?: string } };
        if ((err.code ?? err.cause?.code) === "23505" && attempt < 2) continue; // unique_violation on slug
        throw e;
      }
    }
    throw new HttpError(409, "Couldn't reserve a link for that name. Try again.");
  });
}
