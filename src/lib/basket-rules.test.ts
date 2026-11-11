import { describe, expect, it } from "vitest";
import { AGENT_MAX_WEIGHT_BPS, agentAssetProblem, minBuyUsd, validateWeights } from "./basket-rules";

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
  it("lets a buy go through on agent-moved weights up to the agent's cap", () => {
    const moved = [{ assetId: "NEAR", weightBps: 8000 }, { assetId: "ZEC", weightBps: 2000 }];
    expect(validateWeights(moved).join(" ")).toMatch(/5–50%/); // still refused at creation
    expect(validateWeights(moved, { maxWeightBps: AGENT_MAX_WEIGHT_BPS })).toEqual([]);
    expect(validateWeights([{ assetId: "NEAR", weightBps: 8500 }, { assetId: "ZEC", weightBps: 1500 }], { maxWeightBps: AGENT_MAX_WEIGHT_BPS }).join(" ")).toMatch(/5–80%/);
  });
});

describe("meme coins", () => {
  it("mix with crypto and USDC", () => {
    expect(validateWeights([{ assetId: "HOOT", weightBps: 5000 }, { assetId: "NEARLY", weightBps: 5000 }])).toEqual([]);
    expect(validateWeights([{ assetId: "HOOT", weightBps: 4000 }, { assetId: "NEAR", weightBps: 4000 }, { assetId: "USDC", weightBps: 2000 }])).toEqual([]);
  });
  it("don't mix with stocks or ETFs", () => {
    expect(validateWeights([{ assetId: "HOOT", weightBps: 5000 }, { assetId: "TSLA", weightBps: 5000 }]).join(" ")).toMatch(/can't share a basket with stocks/);
    expect(validateWeights([{ assetId: "NEARLY", weightBps: 5000 }, { assetId: "SPY", weightBps: 5000 }]).join(" ")).toMatch(/can't share a basket with stocks/);
  });
  it("keep agent-managed baskets out", () => {
    expect(agentAssetProblem(["BTC", "ETH"])).toBeNull();
    expect(agentAssetProblem(["BTC", "HOOT"])).toMatch(/can't manage meme coins yet \(HOOT\)/);
  });
  it("start at the $25 meme floor (we relay their swaps), not the $20 one", () => {
    expect(minBuyUsd([{ assetId: "HOOT", weightBps: 5000 }, { assetId: "NEARLY", weightBps: 5000 }], 75)).toBe(25);
    expect(minBuyUsd([{ assetId: "BTC", weightBps: 5000 }, { assetId: "ETH", weightBps: 5000 }], 75)).toBe(20);
  });
});
