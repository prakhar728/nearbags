import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { planLegs, splitFees } from "./preflight";

describe("fees and leg sizing", () => {
  it("splits creator and platform fees off the gross, rounding down", () => {
    const f = splitFees(100_000_000n, 50, 25); // $100, 0.5% + 0.25%
    expect(f.creatorFee).toBe(500_000n);
    expect(f.platformFee).toBe(250_000n);
    expect(f.netUsdc).toBe(99_250_000n);
  });

  it("legs sum exactly to net, last leg takes the remainder", () => {
    const legs = planLegs(99_250_001n, [
      { assetId: "TSLA", weightBps: 3333 },
      { assetId: "NVDA", weightBps: 3333 },
      { assetId: "BTC", weightBps: 3334 },
    ]);
    const total = legs.reduce((s, l) => s + BigInt(l.usdcIn), 0n);
    expect(total).toBe(99_250_001n);
    expect(legs[0].usdcIn).toBe(((99_250_001n * 3333n) / 10_000n).toString());
  });

  it("zero fees leave the gross intact", () => {
    expect(splitFees(20_000_000n, 0, 0).netUsdc).toBe(20_000_000n);
  });
});
