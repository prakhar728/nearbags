"use client";
// All-time P&L chart, closed bags and trade history for the portfolio page. Data: GET /api/portfolio/history.
import Link from "next/link";
import { useMemo, useState } from "react";
import { LineChart, type ChartLine } from "@/components/charts/LineChart";
import { SharePnl } from "@/components/share/SharePnl";
import { Section } from "@/components/ui/Primitives";
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
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="label">{when(p.t)}</div>
          <div className={`big-num mt-2 text-[clamp(30px,4vw,44px)] ${tone(p.pnlUsd)}`}>{signed(p.pnlUsd)}</div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <span className="chip">
            holding <span className="text-text">{usd(p.valueUsd)}</span>
          </span>
          <span className="chip">
            in <span className="text-text">{usd(p.investedUsd)}</span>
          </span>
          <span className="chip">
            back <span className="text-text">{usd(p.returnedUsd)}</span>
          </span>
        </div>
      </div>
      <LineChart times={times} lines={lines} height={240} format={(v) => signed(v)} onHover={setHover} />
    </div>
  );
}

export function ClosedBags({ closed }: { closed: History["closed"] }) {
  if (!closed.length) return null;
  return (
    <Section title="Closed bags" right={<span className="badge">{closed.length} closed</span>}>
      {/* Phones: one card per bag, so the share button is on screen instead of in a sideways-scrolling table. */}
      <ul className="grid gap-2 sm:hidden">
        {closed.map((c, i) => (
          <li key={i} className="card card-pad grid gap-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link href={`/b/${c.basket.slug}`} className="font-sans text-sm font-medium text-text hover:text-accent">
                  {c.basket.name}
                </Link>
                <div className="num mt-0.5 text-[11px] text-muted">closed {when(c.closedAt)}</div>
              </div>
              <span className={`badge shrink-0 normal-case tracking-normal ${c.pnlUsd >= 0 ? "badge-gain" : "badge-loss"}`}>
                {signed(c.pnlUsd)} · {((c.pnlUsd / c.usdIn) * 100).toFixed(1)}%
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="num text-xs text-muted">
                {usd(c.usdIn)} in · {usd(c.usdOut)} back
              </span>
              <SharePnl positionId={c.positionId} basketName={c.basket.name} compact />
            </div>
          </li>
        ))}
      </ul>
      <div className="tbl-wrap max-sm:hidden">
        <table className="tbl min-w-[620px]">
          <thead>
            <tr>
              <th>Basket</th>
              <th className="r">In</th>
              <th className="r">Out</th>
              <th className="r">P&amp;L</th>
              <th className="r">Closed</th>
              <th className="r">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {closed.map((c, i) => (
              <tr key={i}>
                <td>
                  <Link href={`/b/${c.basket.slug}`} className="font-sans text-sm font-medium text-text hover:text-accent">
                    {c.basket.name}
                  </Link>
                </td>
                <td className="r">{usd(c.usdIn)}</td>
                <td className="r">{usd(c.usdOut)}</td>
                <td className="r">
                  <span className={`badge normal-case tracking-normal ${c.pnlUsd >= 0 ? "badge-gain" : "badge-loss"}`}>
                    {signed(c.pnlUsd)} · {((c.pnlUsd / c.usdIn) * 100).toFixed(1)}%
                  </span>
                </td>
                <td className="r text-muted">{when(c.closedAt)}</td>
                <td className="r" data-slot="closed-actions">
                  <SharePnl positionId={c.positionId} basketName={c.basket.name} compact />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
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
    <Section title="Trade history" right={<span className="badge">{trades.length} trades</span>}>
      <div className="tbl-wrap">
        <table className="tbl min-w-[620px]">
          <thead>
            <tr>
              <th>When</th>
              <th>Basket</th>
              <th>Type</th>
              <th className="r">Amount</th>
              <th className="r">Status</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((t) => (
              <tr key={t.orderId}>
                <td className="text-muted">{when(t.at)}</td>
                <td>
                  <Link href={`/b/${t.basket.slug}`} className="font-sans text-sm text-text hover:text-accent">
                    {t.basket.name}
                  </Link>
                </td>
                <td>
                  <span className={`badge ${t.kind === "buy" ? "badge-accent" : ""}`}>
                    {KIND[t.kind] ?? t.kind}
                    {t.kind === "sell" && t.sellPct ? ` ${t.sellPct}%` : ""}
                  </span>
                </td>
                <td className={`r ${t.usdOut != null ? "text-gain" : "text-text"}`}>{t.usdIn != null ? `−${usd(t.usdIn)}` : t.usdOut != null ? `+${usd(t.usdOut)}` : "—"}</td>
                <td className="r">
                  <span className={`badge ${t.status === "complete" ? "" : ["refunded", "failed"].includes(t.status) ? "badge-loss" : "badge-accent"}`}>{STATUS[t.status] ?? t.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}
