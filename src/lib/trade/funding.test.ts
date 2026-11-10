import { describe, expect, it } from "vitest";
import { fundedAmount } from "./funding";

const created = new Date("2026-11-10T07:38:52Z");
const at = (min: number) => created.getTime() + min * 60_000;

describe("fundedAmount", () => {
  it("waits while the balance still reads 0 (the RPC lags 1Click)", () => {
    expect(fundedAmount(20_009_504n, 0n, created, at(1))).toBe(0n);
    expect(fundedAmount(0n, 0n, created, at(1))).toBe(0n);
  });
  it("uses 1Click's figure once the balance shows it", () => {
    expect(fundedAmount(20_009_504n, 20_009_504n, created, at(1))).toBe(20_009_504n);
    expect(fundedAmount(20_009_504n, 20_500_000n, created, at(1))).toBe(20_009_504n);
  });
  it("waits on a partly visible balance, then trusts it after 30 minutes", () => {
    expect(fundedAmount(20_009_504n, 1_000n, created, at(5))).toBe(0n);
    expect(fundedAmount(20_009_504n, 19_900_000n, created, at(31))).toBe(19_900_000n);
  });
  it("uses the balance when 1Click gives no amount", () => {
    expect(fundedAmount(0n, 20_009_504n, created, at(1))).toBe(20_009_504n);
  });
});
