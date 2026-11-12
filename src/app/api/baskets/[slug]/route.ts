// Edit a basket's text after publish (spec Q9, §5.3). Creator only. Name, assets, weights and fee never change.
// Every changed field is logged to basket_edits and shown publicly on the basket page. Rules: lib/creator/actions.ts.
import { handle, requireSession } from "@/lib/auth/session";
import { editBasket } from "@/lib/creator/actions";

export async function PATCH(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  return handle(async () => {
    const session = await requireSession();
    const { slug } = await ctx.params;
    const r = await editBasket(session.userId, slug, await request.json().catch(() => null));
    return r.ok ? Response.json(r.value) : Response.json({ errors: r.errors }, { status: 400 });
  });
}
