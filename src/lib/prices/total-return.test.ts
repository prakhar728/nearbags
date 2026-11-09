import { describe, expect, it } from "vitest";
import { consensusDividends, totalReturn } from "./total-return";
import { combine } from "./median";

describe("totalReturn", () => {
  it("reinvests dividends net of 30% withholding from the ex-date on", () => {
    // Price drops by the dividend on the ex-date (2024-01-03), like a T-bill ETF.
    const closes = new Map([
      ["2024-01-01", 100],
      ["2024-01-02", 100.5],
      ["2024-01-03", 100],
      ["2024-01-04", 100.1],
    ]);
    const tr = totalReturn(closes, [{ date: "2024-01-03", amount: 0.5 }]);
    expect(tr.get("2024-01-02")).toBe(100.5);
    const f = 1 + (0.7 * 0.5) / 100.5;
    expect(tr.get("2024-01-03")).toBeCloseTo(100 * f, 10);
    expect(tr.get("2024-01-04")).toBeCloseTo(100.1 * f, 10);
  });

  it("applies a dividend whose ex-date falls on a non-trading day at the next trading day", () => {
    const closes = new Map([["2024-01-05", 50], ["2024-01-08", 50]]);
    const tr = totalReturn(closes, [{ date: "2024-01-06", amount: 1 }]);
    expect(tr.get("2024-01-08")).toBeCloseTo(50 * (1 + 0.7 / 50), 10);
  });

  it("ignores dividends before the first close", () => {
    const tr = totalReturn(new Map([["2024-02-01", 10]]), [{ date: "2024-01-01", amount: 1 }]);
    expect(tr.get("2024-02-01")).toBe(10);
  });
});

describe("consensusDividends", () => {
  it("merges the same dividend reported on nearby dates by different sources", () => {
    const merged = consensusDividends([
      [{ date: "2024-03-01", amount: 0.25 }],
      [{ date: "2024-03-01", amount: 0.25 }],
      [{ date: "2024-03-02", amount: 0.26 }],
    ]);
    expect(merged).toEqual([{ date: "2024-03-01", amount: 0.25 }]);
  });
  it("keeps separate dividends separate", () => {
    expect(consensusDividends([[{ date: "2024-01-01", amount: 1 }, { date: "2024-04-01", amount: 1 }]])).toHaveLength(2);
  });
});

describe("combine (median)", () => {
  it("drops a 3-source outlier", () => {
    const m = combine(
      { yahoo: [{ date: "d", close: 100 }], nasdaq: [{ date: "d", close: 100.2 }], twelvedata: [{ date: "d", close: 110 }] },
      ["yahoo", "nasdaq", "twelvedata"],
    );
    expect(m[0].close).toBeCloseTo(100.1);
    expect(m[0].flagged).toEqual(["twelvedata"]);
  });
  it("2 sources: averages when close, keeps primary when far apart", () => {
    expect(combine({ yahoo: [{ date: "d", close: 100 }], nasdaq: [{ date: "d", close: 100.4 }] }, ["yahoo", "nasdaq"])[0].close).toBeCloseTo(100.2);
    const far = combine({ yahoo: [{ date: "d", close: 100 }], nasdaq: [{ date: "d", close: 105 }] }, ["yahoo", "nasdaq"])[0];
    expect(far.close).toBe(100);
    expect(far.flagged).toEqual(["nasdaq"]);
  });
});
