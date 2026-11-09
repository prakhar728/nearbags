// Card data for Explore and profiles (server only, request time: call after `await connection()`).
import "server-only";
import type { CardData } from "@/components/basket/BasketCard";
import { getAnalyticsView, getLiveReturn } from "@/lib/analytics/cached";
import { liveMetrics } from "@/lib/basket-pages";
import type { BasketView } from "@/lib/baskets";

const weightsOf = (b: BasketView) => b.assets.map(({ assetId, weightBps }) => ({ assetId, weightBps }));

export async function cardData(baskets: BasketView[]): Promise<CardData[]> {
  const metrics = await liveMetrics(baskets.map((b) => b.id));
  const now = Date.now();
  return Promise.all(
    baskets.map(async (b) => {
      const [live, a] = await Promise.all([b.publishedAt ? getLiveReturn(weightsOf(b), b.publishedAt) : null, getAnalyticsView(weightsOf(b))]);
      let backtest: CardData["backtest"] = null;
      if (!("error" in a)) {
        const k = a.cagr["3y"] != null ? "3y" : a.cagr["1y"] != null ? "1y" : null;
        const longest = a.windows.at(-1)!;
        backtest = k ? { label: k, cagr: a.cagr[k], total: null } : { label: longest.label.toLowerCase(), cagr: null, total: longest.stats.totalReturn };
      }
      return {
        basket: b,
        live: live && b.publishedAt ? { value: live.value, days: Math.max(0, Math.floor((now - Date.parse(b.publishedAt)) / 86_400_000)) } : null,
        backtest,
        metrics: metrics.get(b.id)!,
      };
    }),
  );
}

export const ageDays = (b: BasketView, now = Date.now()) => (b.publishedAt ? (now - Date.parse(b.publishedAt)) / 86_400_000 : 0);

/** Whole days since an ISO time. Request-time only. */
export const daysSince = (iso: string, now = Date.now()) => Math.max(0, Math.floor((now - Date.parse(iso)) / 86_400_000));
