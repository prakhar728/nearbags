import { z } from "zod";
import { handle, HttpError, requireSession } from "@/lib/auth/session";
import { createSellOrder, orderView } from "@/lib/trade/orders";

const Body = z.object({
  positionId: z.number().int().positive(),
  pct: z.number().int(),
  payoutAssetId: z.string().min(3),
  payoutAddress: z.string().min(2).max(128),
});

export async function POST(request: Request) {
  return handle(async () => {
    const s = await requireSession();
    const p = Body.safeParse(await request.json());
    if (!p.success) throw new HttpError(400, "Malformed sell order.");
    const { order } = await createSellOrder(s, p.data);
    return Response.json(await orderView(order.id));
  });
}
