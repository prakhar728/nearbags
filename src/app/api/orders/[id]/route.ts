import { handle, HttpError, requireSession } from "@/lib/auth/session";
import { cancelOrder, orderView, refreshOrder } from "@/lib/trade/orders";

export async function GET(_req: Request, ctx: RouteContext<"/api/orders/[id]">) {
  return handle(async () => {
    const s = await requireSession();
    const id = Number((await ctx.params).id);
    if (!Number.isInteger(id)) throw new HttpError(400, "Bad order id.");
    return Response.json(await refreshOrder(s, id), { headers: { "Cache-Control": "no-store" } });
  });
}

/** Cancel an order that hasn't moved money yet (an unpaid buy, or a sell or withdrawal not being sent right now). */
export async function DELETE(_req: Request, ctx: RouteContext<"/api/orders/[id]">) {
  return handle(async () => {
    const s = await requireSession();
    const id = Number((await ctx.params).id);
    if (!Number.isInteger(id)) throw new HttpError(400, "Bad order id.");
    await cancelOrder(s, id);
    return Response.json(await orderView(id), { headers: { "Cache-Control": "no-store" } });
  });
}
