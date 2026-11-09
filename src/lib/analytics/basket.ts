// Basket analytics: load reference prices, run the backtest, add benchmarks, shape output for the UI.
import { getAsset } from "@/lib/assets";
import { loadSeries } from "@/lib/prices/store";
import { benchmarkPath, runBacktest, type Backtest, type Holding, type Mode } from "./backtest";

export interface WeightInput {
  assetId: string;
  weightBps: number;
}

export interface BasketAnalytics extends Backtest {
  benchmarks: { SPY: number[] | null; BTC: number[] | null };
  pairs: { together: Backtest["correlations"]; offset: Backtest["correlations"] };
}

export function toHoldings(weights: WeightInput[]): Holding[] {
  return weights.map((w) => {
    const a = getAsset(w.assetId);
    return { assetId: a.id, ticker: a.refTicker, weight: w.weightBps / 10_000, kind: a.kind };
  });
}

export async function analyzeBasket(
  weights: WeightInput[],
  opts: { mode?: Mode; maxYears?: number } = {},
): Promise<BasketAnalytics | { error: string }> {
  const holdings = toHoldings(weights);
  const tickers = [...new Set([...holdings.map((h) => h.ticker), "SPY", "BTC"])];
  const series = await loadSeries(tickers);
  const bt = runBacktest(holdings, series, opts);
  if ("error" in bt) return bt;
  const sorted = [...bt.correlations].sort((a, b) => b.rho - a.rho);
  return {
    ...bt,
    benchmarks: {
      SPY: benchmarkPath("SPY", "etf", series, bt.dates),
      BTC: benchmarkPath("BTC", "crypto", series, bt.dates),
    },
    pairs: {
      together: sorted.filter((p) => p.rho >= 0.5).slice(0, 3),
      offset: sorted.filter((p) => p.rho <= 0.1).reverse().slice(0, 3),
    },
  };
}
