// Close a basket to new buyers (spec Q17). Creator only. Never deletes: holders keep selling and withdrawing.
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { handle, HttpError, requireSession } from "@/lib/auth/session";
import { revalidateBasket, revalidateProfiles } from "@/lib/basket-pages";
import { loadOwnBasket } from "@/lib/users";

export async function POST(_request: Request, ctx: { params: Promise<{ slug: string }> }) {
  return handle(async () => {
    const session = await requireSession();
    const { slug } = await ctx.params;
    const basket = await loadOwnBasket(slug, session.userId);
    if (basket.status === "closed") return Response.json({ status: "closed", closedAt: basket.closedAt?.toISOString() ?? null });
    if (basket.status === "hidden") throw new HttpError(409, "This basket is hidden by an admin.");
    const [row] = await db()
      .update(schema.baskets)
      .set({ status: "closed", closedAt: new Date() })
      .where(eq(schema.baskets.id, basket.id))
      .returning();
    revalidateBasket(slug);
    revalidateProfiles();
    return Response.json({ status: row.status, closedAt: row.closedAt?.toISOString() ?? null });
  });
}
