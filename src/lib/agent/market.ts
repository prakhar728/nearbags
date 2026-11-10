// Market data for the strategist: live price, short-term changes, and daily closes on a calendar-day grid.
import "server-only";
import { and, asc, eq, gte } from "drizzle-orm";
import { db, schema } from "@/db";
import { getAsset } from "@/lib/assets";
import { livePrice } from "@/lib/prices/live";

export const DAY = 86_400_000;

// Calendar days of history sent to the strategist: ~200 trading days' average for stocks, 100 days' for crypto, plus
// 90-day returns and volatility. Kept short because the input travels in a NEAR transaction.
const historyDays = (kind: string) => (kind === "stock" || kind === "etf" ? 300 : 120);
/**
 * Daily closes on a calendar-day grid ending today, oldest first: stock closes carry over weekends and holidays so
 * every asset lines up, and today's live price is the last point. Leading days before the first close are dropped.
 */
export function calendarCloses(rows: { date: string; close: number }[], livePx: number, days: number, today = new Date()): number[] {
  const end = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const byDay = new Map(rows.map((r) => [Date.parse(`${r.date}T00:00:00Z`), r.close]));
  const out: number[] = [];
  let last: number | null = null;
  for (let t = end - (days - 1) * DAY; t < end; t += DAY) {
    last = byDay.get(t) ?? last;
    if (last != null) out.push(last);
  }
  out.push(livePx);
  return out.map((x) => Number(x.toPrecision(6)));
}

export async function marketData(assetIds: string[]) {
  return Promise.all(
    assetIds.map(async (id) => {
      const a = getAsset(id);
      const days = historyDays(a.kind);
      const since = new Date(Date.now() - (days + 10) * DAY).toISOString().slice(0, 10);
      const price = (await livePrice(id)).price;
      const rows =
        a.kind === "stable"
          ? []
          : await db()
              .select({ date: schema.priceMedian.date, close: schema.priceMedian.close })
              .from(schema.priceMedian)
              .where(and(eq(schema.priceMedian.ticker, a.refTicker), gte(schema.priceMedian.date, since)))
              .orderBy(asc(schema.priceMedian.date));
      const closes = a.kind === "stable" ? Array(days).fill(1) : calendarCloses(rows, price, days);
      const chg = (n: number) => (closes.length > n ? Math.round((price / closes[closes.length - 1 - n] - 1) * 10_000) / 100 : null);
      return { id: a.id, name: a.name, kind: a.kind, price, change_1d: chg(1), change_7d: chg(7), closes };
    }),
  );
}
