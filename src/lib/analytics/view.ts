// Compact, serializable analytics for the UI (basket page + creator studio). Types and pure helpers only,
// safe to import from client components. The server builder lives in ./present.ts.
import type { Stats } from "./backtest";

export type WindowKey = "1y" | "3y" | "5y" | "max";

export interface WindowView {
  key: WindowKey;
  label: string; // "1Y", "3Y", "5Y", "MAX 1.4Y"
  start: string;
  end: string;
  times: string[]; // downsampled dates (YYYY-MM-DD), ascending, unique
  value: number[]; // $1,000 buy-and-hold
  monthly: number[] | null; // $1,000 rebalanced monthly (comparison only)
  spy: number[] | null;
  btc: number[] | null;
  assets: Record<string, number[]>; // rebased to 100
  contributions: Record<string, number>; // share of the window's total return per asset (hold mode)
  stats: Stats;
}

export interface AnalyticsView {
  assetIds: string[]; // basket order
  weights: Record<string, number>; // fraction
  start: string;
  end: string;
  limitedBy: { assetId: string; since: string } | null;
  annualization: 252 | 365;
  cagr: Record<"1y" | "3y" | "5y", number | null>;
  windows: WindowView[];
  correlations: { a: string; b: string; rho: number }[];
  pairs: { together: { a: string; b: string; rho: number }[]; offset: { a: string; b: string; rho: number }[] };
  diversification: number | null;
}

/** Indices to keep so a series has at most ~`target` points. Always keeps the first and last point. */
export function sampleIndices(n: number, target = 400): number[] {
  if (n <= target) return Array.from({ length: n }, (_, i) => i);
  const step = Math.ceil(n / target);
  const out: number[] = [];
  for (let i = 0; i < n; i += step) out.push(i);
  if (out[out.length - 1] !== n - 1) out.push(n - 1);
  return out;
}

export const pick = <T>(xs: T[], idx: number[]) => idx.map((i) => xs[i]);
