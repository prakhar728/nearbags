"use client";
// All-time P&L chart, closed bags and trade history for the portfolio page. Data: GET /api/portfolio/history.
import Link from "next/link";
import { useMemo, useState } from "react";
import { LineChart, type ChartLine } from "@/components/charts/LineChart";
import type { History } from "@/lib/trade/history";

const ACCENT = "#e8ff59";
const SECOND = "#8a8a8a";
const usd = (x: number) => `$${x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const signed = (x: number) => `${x >= 0 ? "+" : "−"}${usd(Math.abs(x))}`;
const tone = (x: number) => (x >= 0 ? "text-gain" : "text-loss");
const when = (iso: string | number) =>
  new Date(typeof iso === "number" ? iso * 1000 : iso).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export function PnlChart({ series }: { series: History["series"] }) {
  const [hover, setHover] = useState<number | null>(null);
  // lightweight-charts labels timestamps in UTC; shift them so the axis reads in the viewer's local time.
  const times = useMemo(() => series.map((p) => p.t - new Date(p.t * 1000).getTimezoneOffset() * 60), [series]);
  const lines = useMemo<ChartLine[]>(
    () => [
      { id: "pnl", color: ACCENT, width: 2, data: series.map((p) => p.pnlUsd) },
      { id: "zero", color: SECOND, dashed: true, data: series.map(() => 0) },
    ],
    [series],
  );
  if (series.length < 2) return null;
  const p = series[hover ?? series.length - 1];
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 font-mono text-[11px]">
        <span className="num text-faint">{when(p.t)}</span>
        <span className="flex items-baseline gap-1.5">
          <span className="text-muted">P&amp;L</span>
          <span className={`num ${tone(p.pnlUsd)}`}>{signed(p.pnlUsd)}</span>
        </span>
        <span className="flex items-baseline gap-1.5">
          <span className="text-muted">holding</span>
          <span className="num text-text">{usd(p.valueUsd)}</span>
        </span>
        <span className="flex items-baseline gap-1.5">
          <span className="text-muted">in / out</span>
          <span className="num text-text">
            {usd(p.investedUsd)} / {usd(p.returnedUsd)}
          </span>
        </span>
      </div>
      <LineChart times={times} lines={lines} height={220} format={(v) => signed(v)} onHover={setHover} />
    </div>
  );
}

export function ClosedBags({ closed }: { closed: History["closed"] }) {
  if (!closed.length) return null;
  return (
    <section className="grid gap-2">
      <h2 className="font-mono text-[10px] uppercase tracking-wider text-faint">Closed bags</h2>
      <div className="overflow-x-auto border border-border">
        <table className="num w-full min-w-[520px] text-xs">
          <thead className="text-faint">
            <tr>
              <th className="p-3 text-left font-normal">Basket</th>
              <th className="p-3 text-right font-normal">In</th>
              <th className="p-3 text-right font-normal">Out</th>
              <th className="p-3 text-right font-normal">P&amp;L</th>
              <th className="p-3 text-right font-normal">Closed</th>
            </tr>
          </thead>
          <tbody>
            {closed.map((c, i) => (
              <tr key={i} className="border-t border-border">
                <td className="p-3">
                  <Link href={`/b/${c.basket.slug}`} className="hover:underline">
                    {c.basket.name}
                  </Link>
                </td>
                <td className="p-3 text-right">{usd(c.usdIn)}</td>
                <td className="p-3 text-right">{usd(c.usdOut)}</td>
                <td className={`p-3 text-right ${tone(c.pnlUsd)}`}>
                  {signed(c.pnlUsd)} ({((c.pnlUsd / c.usdIn) * 100).toFixed(1)}%)
                </td>
                <td className="p-3 text-right text-muted">{when(c.closedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const KIND: Record<string, string> = { buy: "Buy", sell: "Sell", reset: "Reset to target", withdraw: "Withdraw tokens" };
const STATUS: Record<string, string> = {
  complete: "done",
  partial: "partly done",
  awaiting_deposit: "waiting for deposit",
  funded: "running",
  fees_paid: "running",
  legs_running: "running",
  refunded: "refunded",
  failed: "failed",
  expired: "expired",
};

export function TradeHistory({ trades }: { trades: History["trades"] }) {
  if (!trades.length) return null;
  return (
    <section className="grid gap-2">
      <h2 className="font-mono text-[10px] uppercase tracking-wider text-faint">Trade history</h2>
      <div className="overflow-x-auto border border-border">
        <table className="num w-full min-w-[560px] text-xs">
          <thead className="text-faint">
            <tr>
              <th className="p-3 text-left font-normal">When</th>
              <th className="p-3 text-left font-normal">Basket</th>
              <th className="p-3 text-left font-normal">Type</th>
              <th className="p-3 text-right font-normal">Amount</th>
              <th className="p-3 text-right font-normal">Status</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((t) => (
              <tr key={t.orderId} className="border-t border-border">
                <td className="p-3 text-muted">{when(t.at)}</td>
                <td className="p-3">
                  <Link href={`/b/${t.basket.slug}`} className="hover:underline">
                    {t.basket.name}
                  </Link>
                </td>
                <td className="p-3">
                  {KIND[t.kind] ?? t.kind}
                  {t.kind === "sell" && t.sellPct ? ` ${t.sellPct}%` : ""}
                </td>
                <td className="p-3 text-right">{t.usdIn != null ? `−${usd(t.usdIn)}` : t.usdOut != null ? `+${usd(t.usdOut)}` : "—"}</td>
                <td className={`p-3 text-right ${t.status === "complete" ? "text-muted" : ["refunded", "failed"].includes(t.status) ? "text-loss" : "text-accent"}`}>{STATUS[t.status] ?? t.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
