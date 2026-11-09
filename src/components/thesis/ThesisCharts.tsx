"use client";
// Charts for /thesis. Line charts reuse LineChart (lightweight-charts); categorical data uses plain HTML bars.
import { useMemo, useState } from "react";
import { LineChart, type ChartLine } from "@/components/charts/LineChart";
import { pct, usd } from "@/lib/format";

const ACCENT = "#e8ff59";
const SECOND = "#8a8a8a";

export interface SeriesSpec {
  id: string;
  label: string;
  data: (number | null)[];
  format: "usd" | "count" | "pct";
}

const fmt = (kind: SeriesSpec["format"], v: number | null | undefined) =>
  v == null || !Number.isFinite(v) ? "—" : kind === "usd" ? usd(v, { compact: true }) : kind === "pct" ? pct(v, 2, false) : Math.round(v).toLocaleString("en-US");

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
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 font-mono text-[11px]">
        <span className="num text-faint">{pointLabel} {times[i] ?? "—"}</span>
        {series.map((s, k) => (
          <span key={s.id} className="flex items-baseline gap-1.5">
            <span className="inline-block h-px w-3 self-center" style={{ background: k === 0 ? ACCENT : SECOND }} />
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
    <ul className="grid gap-1.5">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-3 font-mono text-[11px] sm:grid-cols-[7rem_1fr_auto]">
          <span className="truncate text-muted">{r.label}</span>
          <span className="h-3 bg-surface-2">
            <span className="block h-full bg-accent" style={{ width: max > 0 ? `${(r.value / max) * 100}%` : 0 }} />
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
