// Withdraw a position's tokens to the user's own wallets, unchanged (stocks as Ondo tokens on BNB Chain).
import { z } from "zod";
import { handle, HttpError, requireSession } from "@/lib/auth/session";
import { rateLimit } from "@/lib/ratelimit";
import { createWithdrawOrder, orderView, withdrawChains } from "@/lib/trade/orders";
import { assertPayoutApproved } from "@/lib/auth/payout-check";

export async function GET(request: Request) {
  return handle(async () => {
    const s = await requireSession();
    const positionId = Number(new URL(request.url).searchParams.get("positionId"));
    return Response.json({ chains: await withdrawChains(s, positionId) });
  });
}

const Body = z.object({
  positionId: z.number().int().positive(),
  addresses: z.record(z.string(), z.string().max(128)),
  // A fresh wallet signature for addresses that aren't the signed-in wallet (lib/payout-approval.ts).
  approval: z.object({ message: z.string().max(2000), signature: z.string().max(400), publicKey: z.string().max(120).optional() }).optional(),
});

export async function POST(request: Request) {
  return handle(async () => {
    const s = await requireSession();
    await rateLimit("withdraw", 10, 60_000, String(s.userId));
    const p = Body.safeParse(await request.json());
    if (!p.success) throw new HttpError(400, "Malformed request.");
    const entries = Object.entries(p.data.addresses); // keyed by the chain each address receives on
    await assertPayoutApproved(request, s, p.data.positionId, entries.map(([, a]) => a), p.data.approval, entries.map(([c]) => c));
    const { order } = await createWithdrawOrder(s, p.data);
    return Response.json(await orderView(order.id));
  });
}
