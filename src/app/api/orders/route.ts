// Create a buy order: preflight, then a deposit address that funds the basket account.
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { handle, HttpError, requireSession } from "@/lib/auth/session";
import { createBuyOrder, orderView, refreshOrder } from "@/lib/trade/orders";

const Body = z.object({
  basketId: z.number().int().positive(),
  usd: z.number().positive(),
  payAssetId: z.string().min(3),
  refundAddress: z.string().min(2).max(128),
});

export async function POST(request: Request) {
  return handle(async () => {
    const s = await requireSession();
    const p = Body.safeParse(await request.json());
    if (!p.success) throw new HttpError(400, "Malformed order.");
    const { order, preflight } = await createBuyOrder(s, p.data);
    return Response.json({ ...(await orderView(order.id)), preflight });
  });
}

const OPEN = ["awaiting_deposit", "funded", "fees_paid", "legs_running", "partial"] as const;

/** The user's most recent open order on a basket (to resume after a reload), plus their position if any. */
export async function GET(request: Request) {
  return handle(async () => {
    const s = await requireSession();
    const basketId = Number(new URL(request.url).searchParams.get("basketId"));
    if (!Number.isInteger(basketId)) throw new HttpError(400, "basketId required.");
    const [position] = await db()
      .select()
      .from(schema.positions)
      .where(and(eq(schema.positions.userId, s.userId), eq(schema.positions.basketId, basketId)));
    if (!position) return Response.json({ position: null, open: null });
    const [open] = await db()
      .select()
      .from(schema.orders)
      .where(and(eq(schema.orders.positionId, position.id), inArray(schema.orders.status, [...OPEN])))
      .orderBy(desc(schema.orders.createdAt))
      .limit(1);
    return Response.json({ position, open: open ? await refreshOrder(s, open.id) : null }, { headers: { "Cache-Control": "no-store" } });
  });
}
