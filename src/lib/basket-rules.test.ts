import { describe, expect, it } from "vitest";
import { minBuyUsd, validateWeights } from "./basket-rules";

describe("minimum buy", () => {
  it("crypto-only baskets sit at the $20 floor", () => {
    expect(minBuyUsd([{ assetId: "BTC", weightBps: 5000 }, { assetId: "ETH", weightBps: 5000 }], 75)).toBe(20);
  });
  it("a small weight on a high-minimum stock drives the minimum up", () => {
    // HOOD needs $32 per leg; at 20% weight and 0.75% fees → 32 / (0.2 × 0.9925) = 161.2 → $165
    expect(minBuyUsd([{ assetId: "HOOD", weightBps: 2000 }, { assetId: "BTC", weightBps: 8000 }], 75)).toBe(165);
  });
  it("USDC legs never raise the minimum", () => {
    expect(minBuyUsd([{ assetId: "USDC", weightBps: 500 }, { assetId: "ETH", weightBps: 9500 }], 0)).toBe(20);
  });
});

describe("weights", () => {
  it("accepts a valid basket", () => {
    expect(validateWeights([{ assetId: "TSLA", weightBps: 5000 }, { assetId: "BTC", weightBps: 5000 }])).toEqual([]);
  });
  it("rejects bad sums, caps, duplicates and unknown assets", () => {
    const errs = validateWeights([{ assetId: "TSLA", weightBps: 6000 }, { assetId: "TSLA", weightBps: 300 }, { assetId: "PEPE", weightBps: 1000 }]);
    expect(errs.join(" ")).toMatch(/5–50%/);
    expect(errs.join(" ")).toMatch(/twice/);
    expect(errs.join(" ")).toMatch(/approved list/);
    expect(errs.join(" ")).toMatch(/not 100%/);
  });
});
