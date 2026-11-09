// Fresh quote + payload to sign for one swap leg (also used to retry a refunded/failed leg).
import { handle, requireSession } from "@/lib/auth/session";
import { prepareLeg } from "@/lib/trade/orders";

export async function POST(_req: Request, ctx: RouteContext<"/api/orders/[id]/legs/[seq]/intent">) {
  return handle(async () => {
    const s = await requireSession();
    const { id, seq } = await ctx.params;
    return Response.json(await prepareLeg(s, Number(id), Number(seq)));
  });
}
