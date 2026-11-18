import { rateLimit } from "@/lib/ratelimit";
import { z } from "zod";
import { handle, HttpError, requireSession } from "@/lib/auth/session";
import { createSellOrder, orderView } from "@/lib/trade/orders";
import { assertPayoutApproved } from "@/lib/auth/payout-check";

const Body = z.object({
  positionId: z.number().int().positive(),
  pct: z.number().int(),
  payoutAssetId: z.string().min(3),
  payoutAddress: z.string().min(2).max(128),
  // A fresh wallet signature when the payout address isn't the signed-in wallet (lib/payout-approval.ts).
  approval: z.object({ message: z.string().max(2000), signature: z.string().max(400), publicKey: z.string().max(120).optional() }).optional(),
});

export async function POST(request: Request) {
  return handle(async () => {
    const s = await requireSession();
    await rateLimit("sell", 10, 60_000, String(s.userId));
    const p = Body.safeParse(await request.json());
    if (!p.success) throw new HttpError(400, "Malformed sell order.");
    await assertPayoutApproved(request, s, p.data.positionId, [p.data.payoutAddress], p.data.approval);
    const { order } = await createSellOrder(s, p.data);
    return Response.json(await orderView(order.id));
  });
}
