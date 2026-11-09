// Pure aggregation for the thesis track: Explorer rows in, chart series and summary numbers out. No I/O.
// Rules (also shown on /thesis):
// - Only SUCCESS swaps count. A row is deduplicated by depositAddress + depositMemo (a stock-to-stock swap shows up in
//   both the "in" and "out" pulls).
// - USD size = amountInUsd; amountOutUsd when amountInUsd is missing or zero.
// - Trader = refundTo, else the first sender, else the recipient (the party that funded the swap).
// - Weeks start Monday 00:00 UTC. Weekend = Saturday and Sunday, UTC.
import type { AssetRow, DayRow, ExplorerTx, SizeBucket, StonkbagTvl, ThesisSummary, WeekRow, WeekTotals } from "./types";

export const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const DAY = 86_400;

export const SIZE_EDGES: { label: string; minUsd: number; maxUsd: number | null }[] = [
  { label: "< $100", minUsd: 0, maxUsd: 100 },
  { label: "$100–1K", minUsd: 100, maxUsd: 1_000 },
  { label: "$1K–10K", minUsd: 1_000, maxUsd: 10_000 },
  { label: "$10K–100K", minUsd: 10_000, maxUsd: 100_000 },
  { label: "≥ $100K", minUsd: 100_000, maxUsd: null },
];

/** 0 = Monday … 6 = Sunday, UTC. */
export const dayIndex = (sec: number) => (new Date(sec * 1000).getUTCDay() + 6) % 7;

/** Monday 00:00 UTC of the week containing `sec`, as Unix seconds. */
export function weekStartSec(sec: number): number {
  const midnight = Math.floor(sec / DAY) * DAY;
  return midnight - dayIndex(sec) * DAY;
}

export const isoDate = (sec: number) => new Date(sec * 1000).toISOString().slice(0, 10);
export const weekOf = (sec: number) => isoDate(weekStartSec(sec));
export const weekSec = (week: string) => Date.parse(`${week}T00:00:00Z`) / 1000;

/** Every week start from the week of `fromSec` through the week of `toSec`, oldest first. */
export function weeksBetween(fromSec: number, toSec: number): string[] {
  const out: string[] = [];
  for (let w = weekStartSec(fromSec); w <= toSec; w += 7 * DAY) out.push(isoDate(w));
  return out;
}

export const txKey = (t: ExplorerTx) => `${t.depositAddress}|${t.depositMemo ?? ""}`;

export function usdOf(t: ExplorerTx): number {
  const a = Number(t.amountInUsd);
  if (Number.isFinite(a) && a > 0) return a;
  const b = Number(t.amountOutUsd);
  return Number.isFinite(b) && b > 0 ? b : 0;
}

export const traderOf = (t: ExplorerTx) => t.refundTo || t.senders?.[0] || t.recipient;

const touches = (t: ExplorerTx, ids: Set<string>) => ids.has(t.originAsset) || ids.has(t.destinationAsset);

/** Collapse unfiltered 1Click rows into weekly totals (keeps memory flat for large pulls). */
export function weekTotals(txs: ExplorerTx[], ondoIds: Iterable<string>): WeekTotals[] {
  const ids = new Set(ondoIds);
  const seen = new Set<string>();
  const by = new Map<string, WeekTotals>();
  for (const t of txs) {
    if (t.status !== "SUCCESS") continue;
    const k = txKey(t);
    if (seen.has(k)) continue;
    seen.add(k);
    const week = weekOf(t.createdAtTimestamp);
    const row = by.get(week) ?? { week, swaps: 0, volumeUsd: 0, ondoSwaps: 0, ondoVolumeUsd: 0 };
    const usd = usdOf(t);
    row.swaps++;
    row.volumeUsd += usd;
    if (touches(t, ids)) {
      row.ondoSwaps++;
      row.ondoVolumeUsd += usd;
    }
    by.set(week, row);
  }
  return [...by.values()].sort((a, b) => a.week.localeCompare(b.week));
}

const r2 = (x: number) => Math.round(x * 100) / 100;
const r4 = (x: number) => Math.round(x * 10_000) / 10_000;
const frac = (num: number, den: number) => (den > 0 ? r4(num / den) : null);

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export interface AggregateInput {
  ondoTxs: ExplorerTx[]; // union of the "ondo-in" and "ondo-out" pulls (duplicates allowed)
  totals: WeekTotals[]; // only weeks whose unfiltered pull is complete
  weeks: string[]; // the weeks requested, oldest first; every one gets a row even with zero swaps
  ondoIds: string[];
  symbols: Record<string, string>; // asset id → ticker
  asOf: number; // Unix seconds; the end of the 30-day windows
  stonkbag: StonkbagTvl | null;
}

export interface AggregateOutput {
  weekly: WeekRow[];
  byDay: DayRow[];
  sizes: SizeBucket[];
  assets: AssetRow[];
  summary: ThesisSummary;
}

export function aggregate(input: AggregateInput): AggregateOutput {
  const ids = new Set(input.ondoIds);
  const firstSec = input.weeks.length ? weekSec(input.weeks[0]) : -Infinity;

  // Clean rows: success only, Ondo on at least one side, inside the requested range, deduplicated.
  const seen = new Set<string>();
  const txs: ExplorerTx[] = [];
  for (const t of input.ondoTxs) {
    if (t.status !== "SUCCESS" || !touches(t, ids)) continue;
    if (t.createdAtTimestamp < firstSec || t.createdAtTimestamp > input.asOf) continue;
    const k = txKey(t);
    if (seen.has(k)) continue;
    seen.add(k);
    txs.push(t);
  }
  txs.sort((a, b) => a.createdAtTimestamp - b.createdAtTimestamp);

  // Weekly series.
  const totals = new Map(input.totals.map((t) => [t.week, t]));
  const weekly = new Map<string, WeekRow & { traders: Set<string> }>();
  for (const week of input.weeks) {
    const tot = totals.get(week);
    weekly.set(week, {
      week,
      ondoSwaps: 0,
      ondoVolumeUsd: 0,
      ondoTraders: 0,
      buys: 0,
      sells: 0,
      allSwaps: tot ? tot.swaps : null,
      allVolumeUsd: tot ? r2(tot.volumeUsd) : null,
      ondoShare: tot ? frac(tot.ondoVolumeUsd, tot.volumeUsd) : null,
      traders: new Set(),
    });
  }

  const byDay: DayRow[] = DAY_NAMES.map((day) => ({ day, swaps: 0, volumeUsd: 0 }));
  const sizes: SizeBucket[] = SIZE_EDGES.map((e) => ({ ...e, swaps: 0, volumeUsd: 0 }));
  const assets = new Map<string, AssetRow>(
    input.ondoIds.map((id) => [id, { symbol: input.symbols[id] ?? id, assetId: id, swaps: 0, volumeUsd: 0, buys: 0, sells: 0 }]),
  );
  const traderVol = new Map<string, number>();
  const allTraders = new Set<string>();
  const usds: number[] = [];
  const d30 = input.asOf - 30 * DAY;
  const d60 = input.asOf - 60 * DAY;
  let vol = 0, vol30 = 0, volPrev = 0, swaps30 = 0;
  const traders30 = new Set<string>();

  for (const t of txs) {
    const usd = usdOf(t);
    const trader = traderOf(t);
    const inOndo = ids.has(t.destinationAsset);
    const outOndo = ids.has(t.originAsset);

    const w = weekly.get(weekOf(t.createdAtTimestamp));
    if (w) {
      w.ondoSwaps++;
      w.ondoVolumeUsd += usd;
      w.traders.add(trader);
      if (inOndo && !outOndo) w.buys++;
      if (outOndo && !inOndo) w.sells++;
    }

    const d = byDay[dayIndex(t.createdAtTimestamp)];
    d.swaps++;
    d.volumeUsd += usd;

    const b = sizes.find((s) => usd >= s.minUsd && (s.maxUsd == null || usd < s.maxUsd))!;
    b.swaps++;
    b.volumeUsd += usd;

    for (const id of new Set([t.originAsset, t.destinationAsset])) {
      const a = assets.get(id);
      if (!a) continue;
      a.swaps++;
      a.volumeUsd += usd;
      if (id === t.destinationAsset) a.buys++;
      if (id === t.originAsset) a.sells++;
    }

    traderVol.set(trader, (traderVol.get(trader) ?? 0) + usd);
    allTraders.add(trader);
    usds.push(usd);
    vol += usd;
    if (t.createdAtTimestamp > d30) {
      vol30 += usd;
      swaps30++;
      traders30.add(trader);
    } else if (t.createdAtTimestamp > d60) volPrev += usd;
  }

  const weeklyRows: WeekRow[] = [...weekly.values()].map(({ traders, ...w }) => ({ ...w, ondoTraders: traders.size, ondoVolumeUsd: r2(w.ondoVolumeUsd) }));
  const assetRows = [...assets.values()].map((a) => ({ ...a, volumeUsd: r2(a.volumeUsd) })).sort((a, b) => b.volumeUsd - a.volumeUsd || b.swaps - a.swaps);
  const shareWeeks = weeklyRows.filter((w) => w.ondoShare != null);
  const weekend = byDay[5].volumeUsd + byDay[6].volumeUsd;
  const weekendSwaps = byDay[5].swaps + byDay[6].swaps;
  const top10 = [...traderVol.values()].sort((a, b) => b - a).slice(0, 10).reduce((s, x) => s + x, 0);
  const active = weeklyRows.filter((w) => w.ondoSwaps > 0);
  const top = assetRows[0] && assetRows[0].swaps > 0 ? assetRows[0] : null;

  const summary: ThesisSummary = {
    data_since: input.weeks[0] ?? null,
    data_until: isoDate(input.asOf),
    ondo_swaps_total: txs.length,
    ondo_volume_total: r2(vol),
    ondo_traders_total: allTraders.size,
    ondo_swaps_30d: swaps30,
    ondo_volume_30d: r2(vol30),
    ondo_traders_30d: traders30.size,
    ondo_volume_prev_30d: r2(volPrev),
    ondo_volume_change_30d: volPrev > 0 ? r4(vol30 / volPrev - 1) : null,
    weeks_with_ondo_swaps: active.length,
    first_ondo_week: active[0]?.week ?? null,
    weeks_measured_vs_1click: shareWeeks.length,
    ondo_share_latest: shareWeeks.at(-1)?.ondoShare ?? null,
    ondo_share_latest_week: shareWeeks.at(-1)?.week ?? null,
    ondo_share_first: shareWeeks[0]?.ondoShare ?? null,
    ondo_share_first_week: shareWeeks[0]?.week ?? null,
    weekend_volume_share: frac(weekend, vol),
    weekend_swap_share: frac(weekendSwaps, txs.length),
    median_swap_usd: median(usds) == null ? null : r2(median(usds)!),
    share_swaps_under_1k: frac(usds.filter((u) => u < 1_000).length, usds.length),
    largest_swap_usd: usds.length ? r2(Math.max(...usds)) : null,
    top_asset: top?.symbol ?? null,
    top_asset_volume_share: top ? frac(top.volumeUsd, vol) : null,
    top10_trader_volume_share: frac(top10, vol),
    stonkbag_tvl: input.stonkbag ? r2(input.stonkbag.tvlUsd) : null,
    stonkbag_baskets: input.stonkbag?.baskets ?? null,
    stonkbag_holders: input.stonkbag?.holders ?? null,
  };

  return {
    weekly: weeklyRows,
    byDay: byDay.map((d) => ({ ...d, volumeUsd: r2(d.volumeUsd) })),
    sizes: sizes.map((s) => ({ ...s, volumeUsd: r2(s.volumeUsd) })),
    assets: assetRows,
    summary,
  };
}
