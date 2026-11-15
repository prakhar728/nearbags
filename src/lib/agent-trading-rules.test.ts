import { describe, expect, it } from "vitest";
import { cleanSettings, limitProblem, payoutChainOk, tradeProblem } from "./agent-trading-rules";

const on = { enabled: true, dailyUsd: 100, anyBag: false, basketIds: [4] };

describe("agent trading rules", () => {
  it("is off by default and limited to chosen bags", () => {
    expect(tradeProblem({ ...on, enabled: false }, 4)).toMatch(/Trading is off/);
    expect(tradeProblem(on, 4)).toBeNull();
    expect(tradeProblem(on, 5)).toMatch(/isn't allowed to trade that bag/);
    expect(tradeProblem({ ...on, anyBag: true }, 5)).toBeNull();
  });

  it("keeps buys inside the daily limit", () => {
    expect(limitProblem(on, 0, 100)).toBeNull();
    expect(limitProblem(on, 60, 40)).toBeNull();
    expect(limitProblem(on, 60, 41)).toMatch(/\$40\.00 left/);
    expect(limitProblem(on, 150, 1)).toMatch(/\$0\.00 left/);
  });

  it("caps the limit at $1,000 and cleans bag ids", () => {
    expect(() => cleanSettings({ ...on, dailyUsd: 1001 })).toThrow(/\$1 to \$1000/);
    expect(() => cleanSettings({ ...on, dailyUsd: 0 })).toThrow();
    expect(cleanSettings({ ...on, basketIds: [4, 4, -1, 2.5, 7] }).basketIds).toEqual([4, 7]);
  });

  it("pays out only on the owner's wallet chain", () => {
    expect(payoutChainOk("near", "near")).toBe(true);
    expect(payoutChainOk("near", "arb")).toBe(false);
    expect(payoutChainOk("evm", "base")).toBe(true);
    expect(payoutChainOk("evm", "sol")).toBe(false);
  });
});
