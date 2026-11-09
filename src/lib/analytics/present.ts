// Server-side builder for AnalyticsView: one price load, a backtest per window (each window starts at target
// weights, so its chart matches its stats), downsampled for the client.
import "server-only";
import type { WeightInput } from "@/lib/trade/types";
import { analyzeWithSeries, loadBasketSeries, type BasketAnalytics } from "./basket";
import { pick, sampleIndices, type AnalyticsView, type WindowKey, type WindowView } from "./view";

const YEARS: Record<WindowKey, number> = { "1y": 1, "3y": 3, "5y": 5, max: 5 };
const r2 = (x: number) => Math.round(x * 100) / 100;

function windowView(key: WindowKey, hold: BasketAnalytics, monthly: BasketAnalytics | null): WindowView {
  const idx = sampleIndices(hold.dates.length);
  const s = (xs: number[] | null | undefined) => (xs ? pick(xs, idx).map(r2) : null);
  const years = hold.stats.days / 365.25;
  return {
    key,
    label: key === "max" ? `MAX ${years.toFixed(1)}Y` : key.toUpperCase(),
    start: hold.start,
    end: hold.end,
    times: pick(hold.dates, idx),
    value: s(hold.value)!,
    monthly: s(monthly?.value),
    spy: s(hold.benchmarks.SPY),
    btc: s(hold.benchmarks.BTC),
    assets: Object.fromEntries(Object.entries(hold.assetPaths).map(([k, v]) => [k, s(v)!])),
    contributions: hold.contributions,
    stats: hold.stats,
  };
}

export async function buildAnalyticsView(weights: WeightInput[]): Promise<AnalyticsView | { error: string }> {
  const series = await loadBasketSeries(weights);
  const main = analyzeWithSeries(weights, series, { maxYears: 5 });
  if ("error" in main) return main;

  const keys: WindowKey[] = (["1y", "3y", "5y"] as const).filter((k) => main.windows[k]);
  if (!main.windows["5y"]) keys.push("max");

  const windows = keys.map((k) => {
    const hold = k === "5y" || k === "max" ? main : analyzeWithSeries(weights, series, { maxYears: YEARS[k] });
    const monthly = analyzeWithSeries(weights, series, { maxYears: YEARS[k], mode: "monthly" });
    if ("error" in hold) throw new Error(hold.error);
    return windowView(k, hold, "error" in monthly ? null : monthly);
  });

  return {
    assetIds: weights.map((w) => w.assetId),
    weights: Object.fromEntries(weights.map((w) => [w.assetId, w.weightBps / 10_000])),
    start: main.start,
    end: main.end,
    limitedBy: main.limitedBy,
    annualization: main.annualization,
    cagr: {
      "1y": main.windows["1y"]?.cagr ?? null,
      "3y": main.windows["3y"]?.cagr ?? null,
      "5y": main.windows["5y"]?.cagr ?? null,
    },
    windows,
    correlations: main.correlations,
    pairs: main.pairs,
    diversification: main.diversification,
  };
}
