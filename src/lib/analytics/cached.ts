// Cached entry points for pages. Backtests move once a day, so an hour of caching is plenty.
// "use cache: remote": plain "use cache" is per-instance memory on Vercel and re-read years of prices from Neon on most
// visits (4 GB of database transfer in 11 days). The remote cache is shared by every instance.
import { cacheLife } from "next/cache";
import { loadSeries } from "@/lib/prices/store";
import type { Mode } from "./backtest";
import { analyzeBasket, toHoldings, type WeightInput } from "./basket";
import { liveReturn } from "./live-return";
import { buildAnalyticsView } from "./present";

export async function getBasketAnalytics(weights: WeightInput[], mode: Mode = "hold") {
  "use cache: remote";
  cacheLife("hours");
  return analyzeBasket(weights, { mode });
}

/** Everything the basket page and studio preview chart: all windows, both modes, downsampled. */
export async function getAnalyticsView(weights: WeightInput[]) {
  "use cache: remote";
  cacheLife("hours");
  return buildAnalyticsView(weights);
}

/** Live return since publish from median reference closes. `days` is left for the caller (request time). */
export async function getLiveReturn(weights: WeightInput[], publishedAt: string) {
  "use cache: remote";
  cacheLife("hours");
  const holdings = toHoldings(weights);
  const from = new Date(Date.parse(publishedAt) - 14 * 86_400_000).toISOString().slice(0, 10);
  const series = await loadSeries([...new Set(holdings.map((h) => h.ticker))], from);
  const r = liveReturn(holdings, series, publishedAt, Date.parse(publishedAt));
  return r && { value: r.value, since: r.since, asOf: r.asOf };
}
