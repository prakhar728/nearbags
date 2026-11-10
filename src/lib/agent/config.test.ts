import { describe, expect, it } from "vitest";
import { DEFAULT_LIMITS, sanitizeAgentConfig } from "./config";

const S = "Lean into 7-day momentum, keep stocks at half.";

describe("sanitizeAgentConfig", () => {
  it("fills in default limits", () => expect(sanitizeAgentConfig({ strategy: S }).limits).toEqual(DEFAULT_LIMITS));
  it("clamps limits into safe ranges", () => {
    const l = sanitizeAgentConfig({ strategy: S, limits: { minWeightBps: -5, maxWeightBps: 10_000, maxChangeBps: 99_999, maxTurnoverBps: 0 } }).limits;
    expect(l).toEqual({ minWeightBps: 0, maxWeightBps: 8000, maxChangeBps: 5000, maxTurnoverBps: 100 });
  });
  it("ignores junk numbers", () => expect(sanitizeAgentConfig({ strategy: S, limits: { maxWeightBps: "x" as unknown as number } }).limits.maxWeightBps).toBe(2000));
  it("needs a real strategy", () => {
    expect(() => sanitizeAgentConfig({ strategy: "buy" })).toThrow();
    expect(() => sanitizeAgentConfig({ strategy: "x".repeat(2001) })).toThrow();
    expect(() => sanitizeAgentConfig(null)).toThrow();
  });
  it("trims the strategy", () => expect(sanitizeAgentConfig({ strategy: `  ${S}  ` }).strategy).toBe(S));
});
