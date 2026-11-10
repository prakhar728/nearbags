"use client";
// Charts for /thesis. Line charts reuse LineChart (lightweight-charts); categorical data uses plain HTML bars.
import { useMemo, useState } from "react";
import { LineChart, type ChartLine } from "@/components/charts/LineChart";
import { pctSig, usd } from "@/lib/format";
import { CHART } from "@/lib/palette";

const ACCENT = CHART.basket;
const SECOND = CHART.second;

export interface SeriesSpec {
  id: string;
  label: string;
  data: (number | null)[];
  format: "usd" | "count" | "pct";
}

const fmt = (kind: SeriesSpec["format"], v: number | null | undefined) =>
  v == null || !Number.isFinite(v) ? "—" : kind === "usd" ? usd(v, { compact: true }) : kind === "pct" ? pctSig(v) : Math.round(v).toLocaleString("en-US");

/** One or two time series (weekly by default) on a shared axis, with a hover readout. */
export function WeeklyChart({ times, series, height = 240, pointLabel = "week of" }: { times: string[]; series: SeriesSpec[]; height?: number; pointLabel?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const i = hover ?? times.length - 1;
  const lines = useMemo<ChartLine[]>(
    () => series.map((s, k) => ({ id: s.id, color: k === 0 ? ACCENT : SECOND, width: k === 0 ? 2 : 1, dashed: k > 0, data: s.data.map((v) => (v == null ? NaN : v)) })),
    [series],
  );
  const format = series[0].format;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1.5 text-[13px]">
        <span className="label mr-2">{pointLabel} {times[i] ?? "—"}</span>
        {series.map((s, k) => (
          <span key={s.id} className="chip">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: k === 0 ? ACCENT : SECOND }} />
            <span className="text-muted">{s.label}</span>
            <span className="num text-text">{fmt(s.format, s.data[i])}</span>
          </span>
        ))}
      </div>
      <LineChart times={times} lines={lines} height={height} format={(v) => fmt(format, v)} onHover={setHover} />
    </div>
  );
}

export interface BarRow {
  label: string;
  value: number;
  note?: string;
}

/** Horizontal bars; width is relative to the largest row. */
export function Bars({ rows, format }: { rows: BarRow[]; format: "usd" | "count" }) {
  const max = Math.max(0, ...rows.map((r) => r.value));
  return (
    <ul className="grid gap-2.5">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-3 text-[13px] sm:grid-cols-[7rem_1fr_auto]">
          <span className="truncate text-muted">{r.label}</span>
          <span className="bar-track">
            <span className="bar-fill left-0 bg-accent" style={{ width: max > 0 ? `${Math.max(1.5, (r.value / max) * 100)}%` : 0 }} />
          </span>
          <span className="num min-w-[5.5rem] text-right text-text">
            {fmt(format, r.value)}
            {r.note && <span className="ml-2 text-faint">{r.note}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}
