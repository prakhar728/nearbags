import { describe, expect, it } from "vitest";
import { benchmarkPath, maxDrawdown, pearson, runBacktest, simulate, type Backtest, type Holding, type Series } from "./backtest";

const DAY = 86_400_000;
const d = (i: number, start = "2022-01-01") => new Date(Date.parse(start) + i * DAY).toISOString().slice(0, 10);

/** Daily series of n days following f(i). */
function daily(n: number, f: (i: number) => number, start = "2022-01-01") {
  return new Map(Array.from({ length: n }, (_, i) => [d(i, start), f(i)] as const));
}
/** Weekday-only series (stock-like). */
function weekdays(n: number, f: (i: number) => number, start = "2022-01-01") {
  const m = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const date = d(i, start);
    const wd = new Date(date + "T00:00:00Z").getUTCDay();
    if (wd !== 0 && wd !== 6) m.set(date, f(i));
  }
  return m;
}
const ok = (r: Backtest | { error: string }): Backtest => {
  if ("error" in r) throw new Error(r.error);
  return r;
};
const h = (assetId: string, weight: number, kind: Holding["kind"] = "crypto"): Holding => ({ assetId, ticker: assetId, weight, kind });

describe("primitives", () => {
  it("maxDrawdown", () => {
    expect(maxDrawdown([100, 120, 60, 90])).toBeCloseTo(-0.5);
    expect(maxDrawdown([1, 2, 3])).toBe(0);
  });
  it("pearson", () => {
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1);
    expect(pearson([1, 2, 3, 4], [8, 6, 4, 2])).toBeCloseTo(-1);
  });
  it("monthly rebalance differs from buy-and-hold when assets diverge", () => {
    const dates = Array.from({ length: 90 }, (_, i) => d(i));
    const up = dates.map((_, i) => 100 * 1.01 ** i);
    const flat = dates.map(() => 100);
    const hold = simulate([0.5, 0.5], [up, flat], dates, "hold");
    const monthly = simulate([0.5, 0.5], [up, flat], dates, "monthly");
    expect(hold[0]).toBeCloseTo(1000);
    expect(monthly[0]).toBeCloseTo(1000);
    expect(hold.at(-1)!).toBeGreaterThan(monthly.at(-1)!); // trend-following beats rebalancing into the flat asset
  });
});

describe("runBacktest", () => {
  it("single asset doubling over ~2 years", () => {
    const n = 731;
    const series: Series = new Map([["A", daily(n, (i) => 100 * 2 ** (i / (n - 1)))]]);
    const bt = ok(runBacktest([h("A", 1)], series));
    expect(bt.stats.totalReturn).toBeCloseTo(1, 6);
    expect(bt.stats.cagr!).toBeCloseTo(Math.SQRT2 - 1, 2);
    expect(bt.value[0]).toBeCloseTo(1000);
    expect(bt.value.at(-1)!).toBeCloseTo(2000, 3);
    expect(bt.stats.maxDrawdown).toBeCloseTo(0);
    expect(bt.windows["1y"]).toBeDefined();
    expect(bt.windows["3y"]).toBeUndefined();
  });

  it("contributions sum to total return and attribute correctly", () => {
    const series: Series = new Map([
      ["UP", daily(400, (i) => 100 + i / 4)], // ends ~199.75: about +100%
      ["FLAT", daily(400, () => 50)],
    ]);
    const bt = ok(runBacktest([h("UP", 0.5), h("FLAT", 0.5)], series));
    const sum = Object.values(bt.contributions).reduce((s, x) => s + x, 0);
    expect(sum).toBeCloseTo(bt.stats.totalReturn, 10);
    expect(bt.contributions.FLAT).toBeCloseTo(0);
    expect(bt.contributions.UP).toBeCloseTo(0.5 * (bt.assetPaths.UP.at(-1)! / 100 - 1), 10);
  });

  it("forward-fills stocks on weekends when the basket holds crypto, and annualizes with 365", () => {
    const series: Series = new Map([
      ["STK", weekdays(60, (i) => 100 + i)],
      ["CRY", daily(60, (i) => 10 + i / 10)],
    ]);
    const bt = ok(runBacktest([h("STK", 0.5, "stock"), h("CRY", 0.5)], series));
    expect(bt.annualization).toBe(365);
    // 2022-01-01 is a Saturday: shared history starts Monday 2022-01-03, then runs daily.
    expect(bt.start).toBe("2022-01-03");
    expect(bt.dates.length).toBe(58);
    // Saturday 2022-01-08 must carry Friday 2022-01-07's stock price.
    const sat = bt.dates.indexOf("2022-01-08");
    expect(bt.assetPaths.STK[sat]).toBe(bt.assetPaths.STK[sat - 1]);
  });

  it("stock-only baskets use trading days and 252", () => {
    const series: Series = new Map([["STK", weekdays(60, (i) => 100 + i)]]);
    const bt = ok(runBacktest([h("STK", 1, "stock")], series));
    expect(bt.annualization).toBe(252);
    expect(bt.dates.every((x) => ![0, 6].includes(new Date(x + "T00:00:00Z").getUTCDay()))).toBe(true);
  });

  it("reports the asset that limits history", () => {
    const series: Series = new Map([
      ["OLD", daily(800, () => 100)],
      ["NEW", daily(100, () => 100, d(700))],
    ]);
    const bt = ok(runBacktest([h("OLD", 0.5), h("NEW", 0.5)], series));
    expect(bt.limitedBy?.assetId).toBe("NEW");
    expect(bt.start).toBe(d(700));
    expect(bt.stats.cagr).toBeNull(); // under a year: no annualized number
  });

  it("caps history at maxYears", () => {
    const series: Series = new Map([["A", daily(365 * 8, (i) => 100 + i)]]);
    const bt = ok(runBacktest([h("A", 1)], series, { maxYears: 5 }));
    expect(bt.stats.days).toBeGreaterThanOrEqual(365 * 5 - 1);
    expect(bt.stats.days).toBeLessThanOrEqual(365 * 5 + 2);
    expect(bt.windows["5y"]).toBeDefined();
    expect(bt.limitedBy).toBeNull();
  });

  it("USDC is constant and contributes zero", () => {
    const series: Series = new Map([["A", daily(100, (i) => 100 + i)], ["USDC", new Map()]]);
    const bt = ok(runBacktest([h("A", 0.6), { assetId: "USDC", ticker: "USDC", weight: 0.4, kind: "stable" }], series));
    expect(bt.contributions.USDC).toBe(0);
    expect(bt.assetPaths.USDC.every((x) => x === 100)).toBe(true);
  });

  it("diversification: ~0 for identical assets, high for offsetting ones", () => {
    const wiggle = (i: number) => 100 * (1 + 0.05 * Math.sin(i));
    const same = ok(runBacktest([h("A", 0.5), h("B", 0.5)], new Map([["A", daily(200, wiggle)], ["B", daily(200, wiggle)]])));
    expect(same.diversification!).toBeCloseTo(0, 6);
    const mirror = (i: number) => 100 * (1 - 0.05 * Math.sin(i));
    const hedge = ok(runBacktest([h("A", 0.5), h("B", 0.5)], new Map([["A", daily(200, wiggle)], ["B", daily(200, mirror)]])));
    expect(hedge.diversification!).toBeGreaterThan(0.8);
    expect(hedge.correlations[0].rho).toBeLessThan(-0.9);
  });

  it("rejects bad input", () => {
    expect(runBacktest([h("A", 0.7)], new Map([["A", daily(100, () => 1)]]))).toHaveProperty("error");
    expect(runBacktest([h("A", 1)], new Map())).toHaveProperty("error");
    expect(runBacktest([h("A", 1)], new Map([["A", daily(10, () => 1)]]))).toHaveProperty("error"); // < 30 days
  });

  it("benchmark path starts at 1000 on the basket calendar", () => {
    const series: Series = new Map([
      ["A", daily(100, (i) => 100 + i)],
      ["SPY", weekdays(100, (i) => 400 + i)],
    ]);
    const bt = ok(runBacktest([h("A", 1)], series));
    const path = benchmarkPath("SPY", "etf", series, bt.dates.slice(3))!; // start on a date SPY already traded
    expect(path[0]).toBeCloseTo(1000);
    expect(path.length).toBe(bt.dates.length - 3);
  });
});
