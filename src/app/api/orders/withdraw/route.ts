// Withdraw a position's tokens to the user's own wallets, unchanged (stocks as Ondo tokens on BNB Chain).
import { z } from "zod";
import { handle, HttpError, requireSession } from "@/lib/auth/session";
import { rateLimit } from "@/lib/ratelimit";
import { createWithdrawOrder, orderView, withdrawChains } from "@/lib/trade/orders";

export async function GET(request: Request) {
  return handle(async () => {
    const s = await requireSession();
    const positionId = Number(new URL(request.url).searchParams.get("positionId"));
    return Response.json({ chains: await withdrawChains(s, positionId) });
  });
}

const Body = z.object({ positionId: z.number().int().positive(), addresses: z.record(z.string(), z.string().max(128)) });

export async function POST(request: Request) {
  return handle(async () => {
    const s = await requireSession();
    await rateLimit("withdraw", 10, 60_000, String(s.userId));
    const p = Body.safeParse(await request.json());
    if (!p.success) throw new HttpError(400, "Malformed request.");
    const { order } = await createWithdrawOrder(s, p.data);
    return Response.json(await orderView(order.id));
  });
}
