import { describe, expect, it } from "vitest";
import { USDC } from "@/lib/assets";
import { giftUnits, replayGift } from "./gift-replay";

const BTC = "nep141:nbtc.bridge.near";
const ETH = "nep141:eth.omft.near";

// Gift 1 from the round 1 test (local order 12): 20.006754 USDC arrived, 1% creator fee and 0.25% platform fee.
const order = { id: 12, kind: "buy", status: "complete", grossUsdc: "20006754", usdIn: 20 };
const fees = [
  { orderId: 12, status: "success", asset: USDC.intentsAssetId, amount: "200067" },
  { orderId: 12, status: "success", asset: USDC.intentsAssetId, amount: "50016" },
];
const legs = [
  { orderId: 12, status: "success", assetFrom: USDC.intentsAssetId, assetTo: BTC, amountIn: "9878335", amountOutActual: "15369" },
  { orderId: 12, status: "success", assetFrom: USDC.intentsAssetId, assetTo: ETH, amountIn: "9878336", amountOutActual: "5504881507450181" },
];

describe("replayGift", () => {
  it("ends with what the gift account held, and the USDC that went into the bag", () => {
    const r = replayGift([order], legs, fees);
    expect(Object.fromEntries(r.units)).toEqual({ [BTC]: 15369n, [ETH]: 5504881507450181n });
    expect(r.netUsd).toBeCloseTo(19.756671, 6);
    expect(r.paidUsd).toBe(20);
  });

  it("keeps a swap that never settled as USDC, and a USDC weight as it is", () => {
    const r = replayGift(
      [order],
      [
        { ...legs[0], status: "refunded" },
        { orderId: 12, status: "success", assetFrom: USDC.intentsAssetId, assetTo: USDC.intentsAssetId, amountIn: "9878336", amountOutActual: "9878336" },
      ],
      fees,
    );
    expect(Object.fromEntries(r.units)).toEqual({ [USDC.intentsAssetId]: 19756671n });
  });

  it("ignores buys that were never paid", () => {
    const r = replayGift([{ ...order, status: "awaiting_deposit", grossUsdc: null }], [], []);
    expect(r).toEqual({ units: [], netUsd: 0, paidUsd: 0 });
  });
});

describe("giftUnits", () => {
  it("uses what the relayed transfer moved when it was stored", () => {
    const replayed = replayGift([order], legs, fees).units;
    // The account held a little more than the orders say (say a late deposit): `moved` wins.
    expect(Object.fromEntries(giftUnits([[BTC, "15400"], [ETH, "5504881507450181"]], replayed))).toEqual({ [BTC]: 15400n, [ETH]: 5504881507450181n });
  });
  it("falls back to replaying the orders for gifts moved before `moved` existed", () => {
    const replayed = replayGift([order], legs, fees).units;
    expect(giftUnits(null, replayed)).toBe(replayed);
    expect(giftUnits(undefined, replayed)).toBe(replayed);
  });
});
