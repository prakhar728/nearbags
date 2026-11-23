// Stored price and dividend history, one ticker at a time, kept in the shared remote cache.
// Every backtest, chart, share image and portfolio reads from here instead of the database. Reading years of closes
// on each visit used up Neon's free 5 GB of network transfer (2026-11-20) with a 48 MB database.
// Prices change once a day: the price cron calls refreshPriceHistory() after it stores the new day.
import { cacheLife, cacheTag, revalidateTag } from "next/cache";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";

const TAG = "price-history";

// cacheLife/cacheTag throw outside a Next server (scripts run this code with tsx, where "use cache" is a plain
// string and nothing is cached). Same check Next makes before throwing.
function cacheForADay() {
  if (!process.env.__NEXT_USE_CACHE) return;
  cacheLife("days");
  cacheTag(TAG);
}

/** Every stored reference close for a ticker, oldest first, as [date, close]. */
export async function storedCloses(ticker: string): Promise<[string, number][]> {
  "use cache: remote";
  cacheForADay();
  const rows = await db()
    .select({ date: schema.priceMedian.date, close: schema.priceMedian.close })
    .from(schema.priceMedian)
    .where(eq(schema.priceMedian.ticker, ticker))
    .orderBy(asc(schema.priceMedian.date));
  return rows.map((r) => [r.date, r.close]);
}

/** Every stored dividend for a ticker, from every source. */
export async function storedDividends(ticker: string): Promise<{ source: string; date: string; amount: number }[]> {
  "use cache: remote";
  cacheForADay();
  const rows = await db().select().from(schema.dividends).where(eq(schema.dividends.ticker, ticker));
  return rows.map((r) => ({ source: r.source, date: r.exDate, amount: r.amount }));
}

/** After the price cron stores a new day. Visitors get the old history while the new one loads in the background. */
export function refreshPriceHistory() {
  if (process.env.__NEXT_USE_CACHE) revalidateTag(TAG, "max");
}
