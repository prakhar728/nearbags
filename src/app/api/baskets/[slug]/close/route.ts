// Close a basket to new buyers (spec Q17). Creator only. Never deletes: holders keep selling and withdrawing.
import { handle, requireSession } from "@/lib/auth/session";
import { closeBasket } from "@/lib/creator/actions";

export async function POST(_request: Request, ctx: { params: Promise<{ slug: string }> }) {
  return handle(async () => {
    const session = await requireSession();
    const { slug } = await ctx.params;
    return Response.json(await closeBasket(session.userId, slug));
  });
}
