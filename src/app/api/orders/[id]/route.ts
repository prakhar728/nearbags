import { handle, HttpError, requireSession } from "@/lib/auth/session";
import { refreshOrder } from "@/lib/trade/orders";

export async function GET(_req: Request, ctx: RouteContext<"/api/orders/[id]">) {
  return handle(async () => {
    const s = await requireSession();
    const id = Number((await ctx.params).id);
    if (!Number.isInteger(id)) throw new HttpError(400, "Bad order id.");
    return Response.json(await refreshOrder(s, id), { headers: { "Cache-Control": "no-store" } });
  });
}
