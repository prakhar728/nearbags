// Edit a basket's text after publish (spec Q9, §5.3). Creator only. Name, assets, weights and fee never change.
// Every changed field is logged to basket_edits and shown publicly on the basket page.
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { handle, requireSession } from "@/lib/auth/session";
import { revalidateBasket } from "@/lib/basket-pages";
import { EDITABLE_FIELDS, markdownProblems, PatchBasketSchema } from "@/lib/basket-text";
import { loadOwnBasket } from "@/lib/users";

export async function PATCH(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  return handle(async () => {
    const session = await requireSession();
    const { slug } = await ctx.params;
    const p = PatchBasketSchema.safeParse(await request.json().catch(() => null));
    if (!p.success) return Response.json({ errors: [...new Set(p.error.issues.map((i) => i.message))] }, { status: 400 });
    const body = p.data;
    const basket = await loadOwnBasket(slug, session.userId);

    const errors = [...(body.thesis ? markdownProblems("Thesis", body.thesis) : []), ...(body.deepDive ? markdownProblems("Deep dive", body.deepDive) : [])];
    const assets = await db().select().from(schema.basketAssets).where(eq(schema.basketAssets.basketId, basket.id));
    const byAsset = new Map(assets.map((a) => [a.assetId, a]));
    for (const id of Object.keys(body.why ?? {})) if (!byAsset.has(id)) errors.push(`${id} isn't in this basket.`);
    if (errors.length) return Response.json({ errors }, { status: 400 });

    const changes: { field: string; oldValue: string | null; newValue: string | null }[] = [];
    // Required fields (tagline, thesis, risks) can't be null: the schema rejects empty strings for them.
    const set: Partial<Pick<typeof schema.baskets.$inferInsert, (typeof EDITABLE_FIELDS)[number]>> = {};
    for (const f of EDITABLE_FIELDS) {
      const next = body[f];
      if (next === undefined) continue;
      const prev = basket[f] ?? null;
      if ((next ?? null) === prev) continue;
      (set as Record<string, string | null>)[f] = next ?? null;
      changes.push({ field: f, oldValue: prev, newValue: next ?? null });
    }
    const whyChanges = Object.entries(body.why ?? {}).filter(([id, v]) => byAsset.get(id)!.why !== v);
    for (const [id, v] of whyChanges) changes.push({ field: `why:${id}`, oldValue: byAsset.get(id)!.why, newValue: v });

    if (!changes.length) return Response.json({ changed: [] });

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
    return Response.json({ changed: changes.map((c) => c.field) });
  });
}
