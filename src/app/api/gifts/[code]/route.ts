// One gift, as its link shows it. Signed in, it also shows what it's worth.
import { getSession, handle } from "@/lib/auth/session";
import { giftView } from "@/lib/gifts";

export async function GET(_request: Request, ctx: RouteContext<"/api/gifts/[code]">) {
  return handle(async () => {
    const { code } = await ctx.params;
    const s = await getSession();
    return Response.json(await giftView(code, s?.userId ?? null), { headers: { "Cache-Control": "no-store" } });
  });
}
