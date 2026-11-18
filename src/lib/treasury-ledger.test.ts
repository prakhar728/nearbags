import { describe, expect, it } from "vitest";
import { buildLedger, concentration, PAYOUT_SEQ, type LegRow } from "./treasury-ledger";

const USDC = "nep141:usdc";
const BTC = "nep141:btc";
const leg = (p: Partial<LegRow>): LegRow => ({
  at: "2026-11-20T00:00:00Z",
  orderKind: "reset",
  seq: 0,
  assetFrom: USDC,
  assetTo: BTC,
  amountIn: "0",
  amountOutActual: null,
  recipient: null,
  status: "success",
  ...p,
});

describe("treasury ledger", () => {
  it("adds fees received, subtracts what they bought, and predicts the cash left", () => {
    const l = buildLedger({
      usdc: USDC,
      fees: [
        { at: "2026-11-19T00:00:00Z", amount: "2500000", from: "AI Picks" },
        { at: "2026-11-19T01:00:00Z", amount: "1500000", from: "AI Picks" },
      ],
      topups: [],
      feesPaid: [],
      legs: [leg({ amountIn: "3000000", amountOutActual: "3100" })],
    });
    expect(l.totals.received).toBeCloseTo(4);
    expect(l.totals.spent).toBeCloseTo(3);
    expect(l.totals.expectedCash).toBeCloseTo(1);
    expect(l.entries[0]).toMatchObject({ kind: "purchase", usdc: -3, asset: BTC, units: "3100" });
  });

  it("ignores swaps that didn't settle and USDC that never moved", () => {
    const l = buildLedger({
      usdc: USDC,
      fees: [{ at: "2026-11-19T00:00:00Z", amount: "1000000", from: "x" }],
      topups: [],
      feesPaid: [],
      legs: [leg({ amountIn: "500000", status: "refunded" }), leg({ assetTo: USDC, amountIn: "200000", amountOutActual: "200000" })],
    });
    expect(l.totals.spent).toBe(0);
    expect(l.totals.expectedCash).toBeCloseTo(1);
  });

  it("counts the owner's own top-ups, the fees they paid, sales and payouts", () => {
    const l = buildLedger({
      usdc: USDC,
      fees: [],
      topups: [{ at: "2026-11-18T00:00:00Z", grossUsdc: "50000000" }],
      feesPaid: [{ amount: "250000" }],
      legs: [
        leg({ amountIn: "40000000", amountOutActual: "40000" }),
        leg({ orderKind: "sell", assetFrom: BTC, assetTo: USDC, amountIn: "20000", amountOutActual: "21000000" }),
        leg({ orderKind: "sell", seq: PAYOUT_SEQ, assetTo: "nep141:usdt", amountIn: "21000000", amountOutActual: "20990000" }),
      ],
    });
    expect(l.totals.topups).toBeCloseTo(50);
    expect(l.totals.sold).toBeCloseTo(21);
    expect(l.totals.out).toBeCloseTo(21.25);
    expect(l.totals.expectedCash).toBeCloseTo(50 - 40 + 21 - 21.25);
    expect(l.entries.find((e) => e.kind === "out")?.note).toBe("Sale paid out");
  });

  it("counts a sale paid out in USDC as money leaving", () => {
    const l = buildLedger({
      usdc: USDC,
      fees: [],
      topups: [{ at: "2026-11-10T00:00:00Z", grossUsdc: "25000000" }],
      feesPaid: [],
      legs: [
        leg({ amountIn: "25000000", amountOutActual: "1" }),
        leg({ orderKind: "sell", assetFrom: BTC, assetTo: USDC, amountIn: "1", amountOutActual: "24000000" }),
        leg({ orderKind: "sell", seq: PAYOUT_SEQ, assetTo: USDC, amountIn: "24000000", amountOutActual: "24000000" }),
      ],
    });
    expect(l.totals.out).toBeCloseTo(24);
    expect(l.totals.expectedCash).toBeCloseTo(0);
  });

  it("finds the largest holding", () => {
    expect(concentration([])).toEqual({ assetId: null, share: 0 });
    expect(concentration([{ assetId: "BTC", valueUsd: 30 }, { assetId: "ETH", valueUsd: 10 }])).toEqual({ assetId: "BTC", share: 0.75 });
  });

  it("lists a gift claimed into the treasury: its USDC is cash in, the rest is shown, not counted as cash", () => {
    const l = buildLedger({
      usdc: USDC,
      fees: [{ at: "2026-11-17T11:02:00Z", amount: "200067", from: "Test 1" }],
      topups: [],
      feesPaid: [],
      legs: [],
      gifts: [{ at: "2026-11-17T11:05:00Z", note: "A gift", units: [[BTC, "15369"], [USDC, "1000000"]] }],
    });
    expect(l.entries[0]).toMatchObject({ kind: "gift", usdc: 1, note: "A gift", items: [[BTC, "15369"]] });
    expect(l.totals.received).toBeCloseTo(1.200067);
    expect(l.totals.expectedCash).toBeCloseTo(1.200067);
    expect(l.totals.gifts).toBe(1);
  });

  it("counts a gift at what its transfer moved, not at what its orders say", () => {
    // `moved` from the relayed transfer (gift-flows hands it over as units): 2.5 USDC and some BTC.
    const moved: [string, string][] = [
      [BTC, "100"],
      [USDC, "2500000"],
    ];
    const l = buildLedger({ usdc: USDC, fees: [], topups: [], feesPaid: [], legs: [], gifts: [{ at: "2026-11-18T00:00:00Z", note: "A gift", units: moved }] });
    expect(l.entries[0]).toMatchObject({ kind: "gift", usdc: 2.5, items: [[BTC, "100"]] });
    expect(l.totals.expectedCash).toBeCloseTo(2.5);
  });
});
