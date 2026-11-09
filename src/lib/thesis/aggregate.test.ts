import { describe, expect, it } from "vitest";
import { aggregate, dayIndex, weekOf, weekTotals, weeksBetween } from "./aggregate";
import { ONDO_IDS, ONDO_SYMBOL, streamParams } from "./explorer";
import { placeholderValues, renderTemplate } from "./render";
import type { ExplorerTx } from "./types";

// Synthetic fixture. 2026-10-05 is a Monday.
const T = (iso: string) => Date.parse(iso) / 1000;
const TSLA = Object.keys(ONDO_SYMBOL).find((id) => ONDO_SYMBOL[id] === "TSLA")!;
const NVDA = Object.keys(ONDO_SYMBOL).find((id) => ONDO_SYMBOL[id] === "NVDA")!;
const USDC = "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1";
const ETH = "nep141:eth.omft.near";

let n = 0;
function tx(p: Partial<ExplorerTx> & { at: string; usd: number }): ExplorerTx {
  n++;
  return {
    originAsset: USDC,
    destinationAsset: TSLA,
    depositAddress: `dep${n}`,
    depositMemo: null,
    recipient: `r${n}.near`,
    status: "SUCCESS",
    createdAt: p.at,
    createdAtTimestamp: T(p.at),
    amountInUsd: String(p.usd),
    amountOutUsd: String(p.usd * 0.99),
    refundTo: "alice.near",
    senders: [],
    ...p,
  };
}

const W1 = "2026-10-05";
const W2 = "2026-10-12";
const fixture: ExplorerTx[] = [
  tx({ at: "2026-10-05T10:00:00Z", usd: 50 }), // Mon, alice buys TSLA
  tx({ at: "2026-10-06T10:00:00Z", usd: 500, refundTo: "bob.near" }), // Tue, bob buys TSLA
  tx({ at: "2026-10-10T10:00:00Z", usd: 2_000, originAsset: TSLA, destinationAsset: USDC }), // Sat, alice sells TSLA
  tx({ at: "2026-10-13T10:00:00Z", usd: 20_000, originAsset: TSLA, destinationAsset: NVDA, refundTo: "", senders: ["0xcarol"] }), // Tue W2, rotate
  tx({ at: "2026-10-14T10:00:00Z", usd: 150_000, status: "REFUNDED" }), // not counted
  tx({ at: "2026-10-18T10:00:00Z", usd: 0, amountOutUsd: "300", destinationAsset: NVDA }), // Sun, USD falls back to amountOutUsd
];
// The stock-to-stock swap appears in both the "in" and "out" pulls.
const withDup = [...fixture, { ...fixture[3] }];

const asOf = T("2026-10-19T00:00:00Z");
const run = () =>
  aggregate({
    ondoTxs: withDup,
    totals: [{ week: W1, swaps: 10, volumeUsd: 25_500, ondoSwaps: 3, ondoVolumeUsd: 2_550 }],
    weeks: [W1, W2],
    ondoIds: ONDO_IDS,
    symbols: ONDO_SYMBOL,
    asOf,
    stonkbag: null,
  });

describe("calendar helpers", () => {
  it("weeks start Monday UTC", () => {
    expect(weekOf(T("2026-10-11T23:59:59Z"))).toBe(W1); // Sunday
    expect(weekOf(T("2026-10-12T00:00:00Z"))).toBe(W2);
    expect(dayIndex(T("2026-10-10T12:00:00Z"))).toBe(5); // Saturday
    expect(weeksBetween(T("2026-10-07T00:00:00Z"), T("2026-10-19T00:00:00Z"))).toEqual([W1, W2, "2026-10-19"]);
  });
});

describe("aggregate", () => {
  const out = run();

  it("counts success swaps once, per week, with buys, sells and traders", () => {
    expect(out.weekly).toEqual([
      { week: W1, ondoSwaps: 3, ondoVolumeUsd: 2_550, ondoTraders: 2, buys: 2, sells: 1, allSwaps: 10, allVolumeUsd: 25_500, ondoShare: 0.1 },
      { week: W2, ondoSwaps: 2, ondoVolumeUsd: 20_300, ondoTraders: 2, buys: 1, sells: 0, allSwaps: null, allVolumeUsd: null, ondoShare: null },
    ]);
  });

  it("splits weekday and weekend by UTC day", () => {
    expect(out.byDay.map((d) => d.swaps)).toEqual([1, 2, 0, 0, 0, 1, 1]);
    expect(out.summary.weekend_volume_share).toBeCloseTo(2_300 / 22_850, 4);
    expect(out.summary.weekend_swap_share).toBe(0.4);
  });

  it("buckets sizes", () => {
    expect(out.sizes.map((s) => s.swaps)).toEqual([1, 2, 1, 1, 0]);
    expect(out.summary.median_swap_usd).toBe(500);
    expect(out.summary.share_swaps_under_1k).toBe(0.6);
    expect(out.summary.largest_swap_usd).toBe(20_000);
  });

  it("ranks assets; a stock-to-stock swap counts for both", () => {
    const [first, second] = out.assets;
    expect(first).toMatchObject({ symbol: "TSLA", swaps: 4, volumeUsd: 22_550, buys: 2, sells: 2 });
    expect(second).toMatchObject({ symbol: "NVDA", swaps: 2, volumeUsd: 20_300, buys: 2, sells: 0 });
    expect(out.summary.top_asset).toBe("TSLA");
  });

  it("summarises totals, 30-day windows and share", () => {
    const s = out.summary;
    expect(s.ondo_swaps_total).toBe(5);
    expect(s.ondo_volume_total).toBe(22_850);
    expect(s.ondo_traders_total).toBe(3); // alice, bob, 0xcarol
    expect(s.ondo_volume_30d).toBe(22_850);
    expect(s.ondo_volume_change_30d).toBeNull(); // nothing in the 30 days before
    expect(s.ondo_share_latest).toBe(0.1);
    expect(s.ondo_share_latest_week).toBe(W1);
    expect(s.weeks_measured_vs_1click).toBe(1);
    expect(s.weeks_with_ondo_swaps).toBe(2);
    expect(s.top10_trader_volume_share).toBe(1);
  });

  it("handles an empty pull without inventing numbers", () => {
    const e = aggregate({ ondoTxs: [], totals: [], weeks: [W1], ondoIds: ONDO_IDS, symbols: ONDO_SYMBOL, asOf, stonkbag: null });
    expect(e.summary.ondo_volume_total).toBe(0);
    expect(e.summary.median_swap_usd).toBeNull();
    expect(e.summary.top_asset).toBeNull();
    expect(e.summary.ondo_share_latest).toBeNull();
  });
});

describe("weekTotals", () => {
  it("sums all swaps and the Ondo part per week", () => {
    const eth = tx({ at: "2026-10-07T00:00:00Z", usd: 1_000, originAsset: USDC, destinationAsset: ETH });
    const rows = weekTotals([...fixture, eth, eth], ONDO_IDS);
    expect(rows[0]).toEqual({ week: W1, swaps: 4, volumeUsd: 3_550, ondoSwaps: 3, ondoVolumeUsd: 2_550 });
  });
});

describe("request params", () => {
  it("filters by one Ondo id and pages with the last row as cursor", () => {
    const p = streamParams("ondo-in", 100, 200, { depositAddress: "abc", depositMemo: "7" }, ONDO_IDS[3]);
    expect(p.filter(([k]) => k === "toTokenId").map(([, v]) => v)).toEqual([ONDO_IDS[3]]);
    expect(() => streamParams("ondo-out", 100, 200)).toThrow();
    expect(p).toContainEqual(["startTimestampUnix", "99"]);
    expect(p).toContainEqual(["lastDepositAddress", "abc"]);
    expect(p).toContainEqual(["lastDepositMemo", "7"]);
    expect(p).toContainEqual(["direction", "next"]);
  });
});

describe("THESIS.md rendering", () => {
  it("fills known placeholders and refuses unknown ones", () => {
    const values = placeholderValues({ generatedAt: "2026-10-19T00:00:00.000Z", summary: run().summary });
    expect(renderTemplate("{{ondo_volume_30d}} / {{ondo_share_latest}} / {{top_asset}} / {{stonkbag_tvl}}", values)).toBe("$22,850 / 10.0% / TSLA / n/a");
    expect(() => renderTemplate("{{made_up_number}}", values)).toThrow(/made_up_number/);
  });
});
