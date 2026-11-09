import { describe, expect, it } from "vitest";
import { createProblems, markdownProblems, slugify } from "./basket-text";
import { liveReturn } from "./analytics/live-return";
import { sampleIndices } from "./analytics/view";

const valid = {
  name: "AI Picks & Shovels",
  tagline: "Sellers to the gold rush.",
  thesis: "Picks and shovels.",
  risks: "Theme risk.",
  horizon: "1y",
  feeBps: 50,
  assets: [
    { assetId: "NVDA", weightBps: 5000, why: "Chips." },
    { assetId: "MSFT", weightBps: 5000, why: "Cloud." },
  ],
  acceptRisk: true,
};

describe("basket text", () => {
  it("slugifies names", () => {
    expect(slugify("AI Picks & Shovels")).toBe("ai-picks-and-shovels");
    expect(slugify("  Gold / BTC  ")).toBe("gold-btc");
    expect(slugify("!!!")).toBe("basket");
    expect(slugify("Café Crème")).toBe("cafe-creme");
  });

  it("accepts a valid basket", () => {
    const r = createProblems(valid);
    expect(r.errors).toEqual([]);
    expect(r.data?.exitSignal ?? null).toBeNull();
    expect(createProblems({ ...valid, exitSignal: "" }).data?.exitSignal).toBeNull();
  });

  it("rejects bad weights, fees, lengths and missing why", () => {
    expect(createProblems({ ...valid, feeBps: 33 }).errors).toContain("Fee moves in 0.05% steps.");
    expect(createProblems({ ...valid, feeBps: 150 }).errors).toContain("Fee is 1% max.");
    expect(createProblems({ ...valid, name: "x".repeat(41) }).errors[0]).toMatch(/40 characters/);
    expect(createProblems({ ...valid, assets: [{ ...valid.assets[0], weightBps: 6000 }, { ...valid.assets[1], weightBps: 4000 }] }).errors).toContain(
      "NVDA: weight must be 5–50%.",
    );
    expect(createProblems({ ...valid, assets: [valid.assets[0], { ...valid.assets[1], why: " " }] }).errors[0]).toMatch(/Why for asset 2/);
    expect(createProblems({ ...valid, acceptRisk: false }).errors).toContain("Tick the risk acknowledgement.");
  });

  it("flags images and raw HTML in markdown", () => {
    expect(markdownProblems("Deep dive", "![x](https://a.com/x.png)")).toHaveLength(1);
    expect(markdownProblems("Deep dive", "<img src=x>")).toHaveLength(1);
    expect(markdownProblems("Deep dive", "[ok](https://a.com) 3 < 4")).toHaveLength(0);
  });
});

describe("live return", () => {
  it("is the weighted return from the last close on/before publish", () => {
    const series = new Map([
      ["A", new Map([["2026-01-01", 100], ["2026-01-02", 110], ["2026-01-05", 120]])],
      ["B", new Map([["2026-01-01", 50], ["2026-01-03", 40]])],
    ]);
    const r = liveReturn(
      [
        { assetId: "A", ticker: "A", weight: 0.5, kind: "stock" },
        { assetId: "B", ticker: "B", weight: 0.4, kind: "crypto" },
        { assetId: "USDC", ticker: "USDC", weight: 0.1, kind: "stable" },
      ],
      series,
      "2026-01-02T12:00:00Z",
      Date.parse("2026-01-09T13:00:00Z"),
    )!;
    // A: 110 -> 120 (+9.09%), B: 50 -> 40 (-20%), USDC flat
    expect(r.value).toBeCloseTo(0.5 * (120 / 110 - 1) + 0.4 * -0.2, 10);
    expect(r.asOf).toBe("2026-01-05");
    expect(r.days).toBe(7);
  });
});

describe("sampleIndices", () => {
  it("keeps first and last and caps the count", () => {
    const idx = sampleIndices(1000, 400);
    expect(idx[0]).toBe(0);
    expect(idx.at(-1)).toBe(999);
    expect(idx.length).toBeLessThanOrEqual(401);
    expect(sampleIndices(10, 400)).toHaveLength(10);
  });
});
