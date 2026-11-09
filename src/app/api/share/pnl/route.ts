// Make a share link for one of the signed-in user's positions (open or closed). The snapshot is computed here, on the
// server, from the same numbers the portfolio shows — the client only says which position and whether to show dollars.
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { handle, HttpError, requireSession } from "@/lib/auth/session";
import { getBasketById } from "@/lib/baskets";
import { shortWallet } from "@/lib/share/data";
import { signSnapshot } from "@/lib/share/token";
import { rateLimit } from "@/lib/ratelimit";
import { history } from "@/lib/trade/history";
import { portfolio } from "@/lib/trade/portfolio";

const Body = z.object({ positionId: z.number().int().positive(), showAmount: z.boolean().default(false) });
const DAY = 86_400_000;

export async function POST(request: Request) {
  return handle(async () => {
    const s = await requireSession();
    await rateLimit("share", 30, 60_000, String(s.userId));
    const p = Body.safeParse(await request.json());
    if (!p.success) throw new HttpError(400, "Malformed request.");
    const { positionId, showAmount } = p.data;

    const [pos] = await db().select().from(schema.positions).where(eq(schema.positions.id, positionId));
    if (!pos || pos.userId !== s.userId) throw new HttpError(404, "Position not found.");
    const basket = await getBasketById(pos.basketId);
    if (!basket) throw new HttpError(404, "Basket not found.");
    const [user] = await db().select().from(schema.users).where(eq(schema.users.id, s.userId));

    const h = await history(s.userId);
    const [firstBuyOrder] = await db()
      .select({ at: schema.orders.createdAt })
      .from(schema.orders)
      .where(and(eq(schema.orders.positionId, positionId), eq(schema.orders.kind, "buy")))
      .orderBy(asc(schema.orders.createdAt))
      .limit(1);
    const firstBuy = firstBuyOrder?.at.getTime();
    const closed = h.closed.find((c) => c.positionId === positionId);
    let pct: number;
    let usd: number;
    let state: "open" | "closed";
    let days: number;
    if (closed) {
      pct = closed.pnlUsd / closed.usdIn;
      usd = closed.pnlUsd;
      state = "closed";
      days = Math.round((Date.parse(closed.closedAt) - (firstBuy ?? Date.parse(closed.closedAt))) / DAY);
    } else {
      const open = (await portfolio(s.userId)).find((r) => r.positionId === positionId);
      if (!open || open.pnlUsd == null || !open.costUsd) throw new HttpError(409, "This bag has no completed buy yet.");
      pct = open.pnlUsd / open.costUsd;
      usd = open.pnlUsd;
      state = "open";
      days = open.boughtAt ? Math.floor((Date.now() - Date.parse(String(open.boughtAt))) / DAY) : 0;
    }

    const token = await signSnapshot({
      v: 1,
      slug: basket.slug,
      name: basket.name,
      assets: basket.assets.map((a) => a.assetId),
      pct: Math.round(pct * 10_000) / 10_000,
      usd: showAmount ? Math.round(usd * 100) / 100 : null,
      days: Math.max(0, days),
      state,
      by: user?.handle ? `@${user.handle}` : user ? shortWallet(user.walletAddress) : null,
      at: new Date().toISOString(),
    });
    return Response.json({ path: `/s/${token}`, image: `/api/og/pnl/${token}` });
  });
}
