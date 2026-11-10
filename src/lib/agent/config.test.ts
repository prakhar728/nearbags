import { describe, expect, it } from "vitest";
import { DEFAULT_LIMITS, minMaxWeightBps, sanitizeAgentConfig } from "./config";

const S = "Lean into 7-day momentum, keep stocks at half.";

describe("sanitizeAgentConfig", () => {
  it("fills in default limits", () => expect(sanitizeAgentConfig({ strategy: S }, 4).limits).toEqual(DEFAULT_LIMITS));
  it("clamps limits into safe ranges", () => {
    const l = sanitizeAgentConfig({ strategy: S, limits: { minWeightBps: -5, maxWeightBps: 10_000, maxChangeBps: 99_999, maxTurnoverBps: 0 } }, 4).limits;
    expect(l).toEqual({ minWeightBps: 0, maxWeightBps: 8000, maxChangeBps: 5000, maxTurnoverBps: 100 });
  });
  it("ignores junk numbers", () => expect(sanitizeAgentConfig({ strategy: S, limits: { maxWeightBps: "x" as unknown as number } }, 4).limits.maxWeightBps).toBe(3500));
  it("needs a real strategy", () => {
    expect(() => sanitizeAgentConfig({ strategy: "buy" }, 4)).toThrow();
    expect(() => sanitizeAgentConfig({ strategy: "x".repeat(2001) }, 4)).toThrow();
    expect(() => sanitizeAgentConfig(null, 4)).toThrow();
  });
  it("leaves a two-asset basket room to move", () => {
    expect(minMaxWeightBps(2)).toBe(6000);
    expect(minMaxWeightBps(3)).toBe(4334);
    expect(sanitizeAgentConfig({ strategy: S, limits: { maxWeightBps: 5000 } }, 2).limits.maxWeightBps).toBe(6000);
    expect(sanitizeAgentConfig({ strategy: S, limits: { maxWeightBps: 7000 } }, 2).limits.maxWeightBps).toBe(7000);
  });
  it("trims the strategy", () => expect(sanitizeAgentConfig({ strategy: `  ${S}  ` }, 4).strategy).toBe(S));
});
