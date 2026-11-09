// Backtest engine (spec §7.2). Pure functions, no I/O: give it reference closes, get analytics back.
//
// Conventions
// - Calendar = union of real price dates of the basket's assets. Any crypto in the basket makes it a daily calendar;
//   stocks are forward-filled across weekends/holidays. Stock-only baskets use trading days.
// - Annualization: 365 if the basket holds crypto, else 252.
// - Default mode is buy-and-hold from the window start (what holders actually get: baskets are frozen and never
//   auto-rebalance). "monthly" resets to target weights on the first calendar date of each month, for comparison.
// - USDC is a constant 1.0.
// - Closes are split-adjusted, not dividend-adjusted: returns exclude dividends (conservative).

export type Series = Map<string, Map<string, number>>; // ticker -> date -> close

export interface Holding {
  assetId: string;
  ticker: string;
  weight: number; // fraction; all weights sum to 1
  kind: "stock" | "etf" | "crypto" | "stable";
}

export type Mode = "hold" | "monthly";

export interface Stats {
  totalReturn: number;
  cagr: number | null; // null when the window is shorter than ~1 year (annualizing would mislead)
  maxDrawdown: number; // negative fraction, e.g. -0.32
  volatility: number; // annualized
  sharpe: number | null; // rf = 0
  days: number;
}

export interface Backtest {
  start: string;
  end: string;
  limitedBy: { assetId: string; since: string } | null;
  annualization: 252 | 365;
  dates: string[];
  value: number[]; // $1,000 invested at start
  stats: Stats;
  windows: Partial<Record<"1y" | "3y" | "5y", Stats>>;
  assetPaths: Record<string, number[]>; // each asset rebased to 100 at start
  contributions: Record<string, number>; // share of total return per asset (sums to stats.totalReturn), hold mode
  correlations: { a: string; b: string; rho: number }[]; // daily returns, last 365 calendar days
  diversification: number | null; // 1 - σ_basket / Σ wᵢσᵢ over the main window
}

const DAY = 86_400_000;
const MIN_DAYS = 30;
const addYears = (d: string, y: number) => {
  const t = new Date(d + "T00:00:00Z");
  t.setUTCFullYear(t.getUTCFullYear() - y);
  return t.toISOString().slice(0, 10);
};
const daysBetween = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / DAY;

export function mean(xs: number[]) {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;
}
export function stdev(xs: number[]) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
}
export function pearson(a: number[], b: number[]) {
  const n = Math.min(a.length, b.length);
  if (n < 3) return 0;
  const ma = mean(a.slice(0, n));
  const mb = mean(b.slice(0, n));
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return da && db ? num / Math.sqrt(da * db) : 0;
}
const returns = (v: number[]) => v.slice(1).map((x, i) => x / v[i] - 1);

export function maxDrawdown(v: number[]) {
  let peak = -Infinity;
  let mdd = 0;
  for (const x of v) {
    peak = Math.max(peak, x);
    mdd = Math.min(mdd, x / peak - 1);
  }
  return mdd;
}

export function computeStats(dates: string[], v: number[], ann: number): Stats {
  const r = returns(v);
  const days = daysBetween(dates[0], dates[dates.length - 1]);
  const totalReturn = v[v.length - 1] / v[0] - 1;
  const vol = stdev(r) * Math.sqrt(ann);
  return {
    totalReturn,
    cagr: days >= 360 ? (1 + totalReturn) ** (365.25 / days) - 1 : null,
    maxDrawdown: maxDrawdown(v),
    volatility: vol,
    sharpe: vol > 0 && days >= 90 ? (mean(r) * ann) / vol : null,
    days: Math.round(days),
  };
}

/** Dates on which at least one (non-USDC) holding has a real price, from `from` to `end`. */
function calendar(holdings: Holding[], series: Series, from: string, end: string): string[] {
  const set = new Set<string>();
  for (const h of holdings) {
    if (h.kind === "stable") continue;
    for (const d of series.get(h.ticker)?.keys() ?? []) if (d >= from && d <= end) set.add(d);
  }
  return [...set].sort();
}

/** Forward-filled price matrix [asset][date]. Requires every asset to have a price on or before dates[0]. */
function priceMatrix(holdings: Holding[], series: Series, dates: string[]): number[][] {
  return holdings.map((h) => {
    if (h.kind === "stable") return dates.map(() => 1);
    const s = series.get(h.ticker)!;
    const sorted = [...s.keys()].sort();
    let j = 0;
    let last = NaN;
    return dates.map((d) => {
      while (j < sorted.length && sorted[j] <= d) last = s.get(sorted[j++])!;
      return last;
    });
  });
}

export function simulate(weights: number[], prices: number[][], dates: string[], mode: Mode, initial = 1000): number[] {
  const n = dates.length;
  const out = new Array<number>(n);
  let units = weights.map((w, i) => (w * initial) / prices[i][0]);
  for (let t = 0; t < n; t++) {
    if (mode === "monthly" && t > 0 && dates[t].slice(0, 7) !== dates[t - 1].slice(0, 7)) {
      // Rebalance at the previous close so the new month starts at target weights.
      const v = units.reduce((s, u, i) => s + u * prices[i][t - 1], 0);
      units = weights.map((w, i) => (w * v) / prices[i][t - 1]);
    }
    out[t] = units.reduce((s, u, i) => s + u * prices[i][t], 0);
  }
  return out;
}

export function firstDates(holdings: Holding[], series: Series) {
  return holdings
    .filter((h) => h.kind !== "stable")
    .map((h) => ({ assetId: h.assetId, since: [...(series.get(h.ticker)?.keys() ?? [])].sort()[0] }));
}

export function runBacktest(
  holdings: Holding[],
  series: Series,
  opts: { end?: string; maxYears?: number; mode?: Mode } = {},
): Backtest | { error: string } {
  if (!holdings.length) return { error: "No holdings" };
  const wsum = holdings.reduce((s, h) => s + h.weight, 0);
  if (Math.abs(wsum - 1) > 1e-6) return { error: `Weights sum to ${wsum}, expected 1` };
  const missing = holdings.find((h) => h.kind !== "stable" && !series.get(h.ticker)?.size);
  if (missing) return { error: `No price history for ${missing.assetId}` };

  const mode = opts.mode ?? "hold";
  const maxYears = opts.maxYears ?? 5;
  const ann: 252 | 365 = holdings.some((h) => h.kind === "crypto") ? 365 : 252;

  const firsts = firstDates(holdings, series);
  const latestStart = firsts.reduce((a, b) => (b.since > a.since ? b : a), firsts[0] ?? { assetId: "", since: "1900-01-01" });
  const allDates = calendar(holdings, series, "1900-01-01", opts.end ?? "9999-12-31");
  const end = allDates[allDates.length - 1];
  const floor = addYears(end, maxYears);
  const start = latestStart.since > floor ? latestStart.since : floor;
  const dates = allDates.filter((d) => d >= start);
  if (dates.length < MIN_DAYS) return { error: `Not enough shared history (${dates.length} days since ${start})` };

  const prices = priceMatrix(holdings, series, dates);
  const w = holdings.map((h) => h.weight);
  const value = simulate(w, prices, dates, mode);
  const stats = computeStats(dates, value, ann);

  const windows: Backtest["windows"] = {};
  for (const [label, years] of [["1y", 1], ["3y", 3], ["5y", 5]] as const) {
    const ws = addYears(end, years);
    if (ws < start || years > maxYears) continue;
    const wd = dates.filter((d) => d >= ws);
    const off = dates.length - wd.length;
    const wp = prices.map((row) => row.slice(off));
    windows[label] = computeStats(wd, simulate(w, wp, wd, mode), ann);
  }

  const assetPaths: Record<string, number[]> = {};
  holdings.forEach((h, i) => (assetPaths[h.assetId] = prices[i].map((p) => (p / prices[i][0]) * 100)));

  // Buy-and-hold contribution: each asset's dollar gain over the initial $1,000. Sums exactly to totalReturn in hold mode.
  const contributions: Record<string, number> = {};
  const last = dates.length - 1;
  holdings.forEach((h, i) => (contributions[h.assetId] = h.weight * (prices[i][last] / prices[i][0] - 1)));

  // Correlations on real (not forward-filled) prices, last 365 days, per pair on dates both traded.
  const corrFrom = new Date(Date.parse(end) - 365 * DAY).toISOString().slice(0, 10);
  const nonStable = holdings.filter((h) => h.kind !== "stable");
  const correlations: Backtest["correlations"] = [];
  for (let i = 0; i < nonStable.length; i++) {
    for (let j = i + 1; j < nonStable.length; j++) {
      const a = series.get(nonStable[i].ticker)!;
      const b = series.get(nonStable[j].ticker)!;
      const both = [...a.keys()].filter((d) => d >= corrFrom && d <= end && b.has(d)).sort();
      const ra = returns(both.map((d) => a.get(d)!));
      const rb = returns(both.map((d) => b.get(d)!));
      correlations.push({ a: nonStable[i].assetId, b: nonStable[j].assetId, rho: pearson(ra, rb) });
    }
  }

  const sigmaB = stdev(returns(value));
  const sigmaSum = holdings.reduce((s, h, i) => s + h.weight * stdev(returns(prices[i])), 0);
  const diversification = sigmaSum > 0 && holdings.length > 1 ? 1 - sigmaB / sigmaSum : null;

  return {
    start: dates[0],
    end,
    limitedBy: latestStart.since > floor ? latestStart : null,
    annualization: ann,
    dates,
    value,
    stats,
    windows,
    assetPaths,
    contributions,
    correlations,
    diversification,
  };
}

/** Benchmark path on the basket's own calendar (forward-filled), $1,000 at the basket's start. */
export function benchmarkPath(ticker: string, kind: Holding["kind"], series: Series, dates: string[]): number[] | null {
  const s = series.get(ticker);
  if (!s?.size || [...s.keys()].sort()[0] > dates[0]) return null;
  const [row] = priceMatrix([{ assetId: ticker, ticker, weight: 1, kind }], series, dates);
  return row.map((p) => (p / row[0]) * 1000);
}
