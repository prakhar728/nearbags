import { describe, expect, it } from "vitest";
import { DEFAULT_LIMITS, minMaxWeightBps, sanitizeAgentConfig } from "./config";
import { outsideBands } from "./templates";

const S = "Lean into 7-day momentum, keep stocks at half.";
const four = ["BTC", "ETH", "SOL", "NEAR"].map((assetId) => ({ assetId, weightBps: 2500 }));
const two = four.slice(0, 2).map((a) => ({ ...a, weightBps: 5000 }));

describe("sanitizeAgentConfig", () => {
  it("fills in default limits", () => expect(sanitizeAgentConfig({ strategy: S }, four).limits).toEqual(DEFAULT_LIMITS));
  it("clamps limits into safe ranges", () => {
    const l = sanitizeAgentConfig({ strategy: S, limits: { minWeightBps: -5, maxWeightBps: 10_000, maxChangeBps: 99_999, maxTurnoverBps: 0 } }, four).limits;
    expect(l).toEqual({ minWeightBps: 0, maxWeightBps: 8000, maxChangeBps: 5000, maxTurnoverBps: 100 });
  });
  it("ignores junk numbers", () => expect(sanitizeAgentConfig({ strategy: S, limits: { maxWeightBps: "x" as unknown as number } }, four).limits.maxWeightBps).toBe(3500));
  it("needs a real strategy", () => {
    expect(() => sanitizeAgentConfig({ strategy: "buy" }, four)).toThrow();
    expect(() => sanitizeAgentConfig({ strategy: "x".repeat(2001) }, four)).toThrow();
    expect(() => sanitizeAgentConfig(null, four)).toThrow();
  });
  it("leaves a two-asset basket room to move", () => {
    expect(minMaxWeightBps(2)).toBe(6000);
    expect(minMaxWeightBps(3)).toBe(4334);
    expect(sanitizeAgentConfig({ strategy: S, limits: { maxWeightBps: 5000 } }, two).limits.maxWeightBps).toBe(6000);
    expect(sanitizeAgentConfig({ strategy: S, limits: { maxWeightBps: 7000 } }, two).limits.maxWeightBps).toBe(7000);
  });
  it("trims the strategy", () => expect(sanitizeAgentConfig({ strategy: `  ${S}  ` }, four).strategy).toBe(S));
});

describe("templates", () => {
  it("takes a template instead of a strategy and records the starting weights", () => {
    const c = sanitizeAgentConfig({ template: "equal" }, four);
    expect(c.strategy).toBe("");
    expect(c.template).toEqual({ id: "equal", baseBps: { BTC: 2500, ETH: 2500, SOL: 2500, NEAR: 2500 } });
  });
  it("drops a written strategy when a template is picked", () => expect(sanitizeAgentConfig({ template: { id: "fixed" }, strategy: S }, four).strategy).toBe(""));
  it("refuses unknown templates", () => expect(() => sanitizeAgentConfig({ template: "yolo" }, four)).toThrow());
  it("needs USDC for templates that park money in cash", () => {
    expect(() => sanitizeAgentConfig({ template: "trend" }, four)).toThrow(/USDC/);
    expect(sanitizeAgentConfig({ template: "trend" }, [...four.slice(0, 3), { assetId: "USDC", weightBps: 2500 }]).template?.id).toBe("trend");
  });
});

describe("outsideBands", () => {
  const row = (weightBps: number, targetBps: number, minLegUsd = 3) => ({ weightBps, targetBps, minLegUsd });
  it("a quarter of the target, at most 5 points", () => {
    expect(outsideBands([row(2400, 2000)], 10_000)).toBe(false); // 4 points < 5
    expect(outsideBands([row(2600, 2000)], 10_000)).toBe(true);
    expect(outsideBands([row(6400, 6000)], 10_000)).toBe(false); // 4 points < 5 cap
    expect(outsideBands([row(800, 1200)], 10_000)).toBe(true); // 4 points > 3 (a quarter of 12)
  });
  it("never smaller than what can be traded", () => {
    expect(outsideBands([row(2600, 2000, 12)], 100)).toBe(false); // $6 drift on a $100 basket can't clear a $12 swap
  });
});
