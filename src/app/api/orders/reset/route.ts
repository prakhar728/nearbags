// Reset a position to its basket's target weights: sell what's over, buy what's under. No fees.
import { z } from "zod";
import { handle, HttpError, requireSession } from "@/lib/auth/session";
import { rateLimit } from "@/lib/ratelimit";
import { createResetOrder, orderView } from "@/lib/trade/orders";

const Body = z.object({ positionId: z.number().int().positive() });

export async function POST(request: Request) {
  return handle(async () => {
    const s = await requireSession();
    await rateLimit("reset", 10, 60_000, String(s.userId));
    const p = Body.safeParse(await request.json());
    if (!p.success) throw new HttpError(400, "Malformed request.");
    const { order } = await createResetOrder(s, p.data.positionId);
    return Response.json(await orderView(order.id));
  });
}
