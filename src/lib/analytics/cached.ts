// Cached entry points for pages. Backtests move once a day, so an hour of caching is plenty.
import { cacheLife } from "next/cache";
import type { Mode } from "./backtest";
import { analyzeBasket, type WeightInput } from "./basket";

export async function getBasketAnalytics(weights: WeightInput[], mode: Mode = "hold") {
  "use cache";
  cacheLife("hours");
  return analyzeBasket(weights, { mode });
}
