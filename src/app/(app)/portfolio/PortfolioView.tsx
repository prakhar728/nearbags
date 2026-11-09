"use client";
import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ManagePanel } from "@/components/trade/ManagePanel";
import { SellPanel } from "@/components/trade/SellPanel";
import { Loading, LoadingNote, Skeleton } from "@/components/ui/Skeleton";
import { useAuth } from "@/lib/client/auth";
import type { History } from "@/lib/trade/history";
import type { PortfolioPosition } from "@/lib/trade/portfolio";
import { ClosedBags, PnlChart, TradeHistory } from "./History";

const usd = (x: number) => `$${x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const signed = (x: number) => `${x >= 0 ? "+" : "−"}${usd(Math.abs(x))}`;

export function PortfolioView() {
  const { user, loading } = useAuth();
  const [open, setOpen] = useState<number | null>(null);
  const q = useQuery({
    queryKey: ["portfolio", user?.id],
    enabled: Boolean(user),
    queryFn: async (): Promise<PortfolioPosition[]> => {
      const r = await fetch("/api/portfolio", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      return j.positions;
    },
  });
  const h = useQuery({
    queryKey: ["portfolio-history", user?.id],
    enabled: Boolean(user),
    queryFn: async (): Promise<History> => {
      const r = await fetch("/api/portfolio/history", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      return j;
    },
  });
  const rows = q.data ?? null;
  const hist = h.data ?? null;
  const err = q.error ? (q.error as Error).message : null;
  const load = () => {
    void q.refetch();
    void h.refetch();
  };

  if (loading) return <PortfolioSkeleton />;
  if (!user) return <p className="text-sm text-muted">Connect a wallet to see your baskets.</p>;
  if (err) return <p className="text-sm text-loss">{err}</p>;
  if (!rows) return <PortfolioSkeleton note="Reading your basket accounts on-chain…" />;
  if (!rows.length && !hist?.trades.length)
    return (
      <p className="text-sm text-muted">
        No baskets yet. <Link href="/explore" className="text-text underline decoration-border-strong underline-offset-4">Find one to bag</Link>.
      </p>
    );

  const total = rows.reduce((s, r) => s + r.valueUsd, 0);
  const exitAll = rows.every((r) => r.exitUsd != null) ? rows.reduce((s, r) => s + (r.exitUsd ?? 0), 0) : null;
  const cost = rows.reduce((s, r) => s + r.costUsd, 0);
  const pnl = cost > 0 ? (exitAll ?? total) - cost : null;
  const all = hist?.totals;

  return (
    <div className="grid gap-8">
      <div className="flex flex-wrap items-end gap-x-10 gap-y-3">
        <Stat
          label="Holding now"
          value={usd(total)}
          sub={!rows.length ? "no open bags" : exitAll != null ? `sell value ${usd(exitAll)} · ${(((exitAll / total) - 1) * 100).toFixed(1)}% vs market` : "some assets can't be sold right now"}
        />
        {rows.length > 0 && pnl != null && <Stat label="Open P&L" value={signed(pnl)} tone={pnl >= 0 ? "text-gain" : "text-loss"} sub={`on ${usd(cost)} in`} />}
        {all && all.investedUsd > 0 ? (
          <Stat
            label="All-time P&L"
            value={`${signed(all.pnlUsd)} (${((all.pnlUsd / all.investedUsd) * 100).toFixed(1)}%)`}
            tone={all.pnlUsd >= 0 ? "text-gain" : "text-loss"}
            sub={`${usd(all.investedUsd)} in · ${usd(all.returnedUsd)} back`}
          />
        ) : h.isPending ? (
          <div className="space-y-2">
            <Skeleton className="h-2.5 w-20" />
            <Skeleton className="h-7 w-32" />
            <Skeleton className="h-2.5 w-40" />
          </div>
        ) : null}
      </div>

      {hist && hist.series.length >= 2 && (
        <section className="grid gap-2">
          <h2 className="font-mono text-[10px] uppercase tracking-wider text-faint">P&amp;L over time</h2>
          <PnlChart series={hist.series} />
        </section>
      )}

      <section className="grid gap-2">
      <h2 className="font-mono text-[10px] uppercase tracking-wider text-faint">Open bags</h2>
      {!rows.length ? (
        <p className="text-sm text-muted">
          No open bags. <Link href="/explore" className="text-text underline decoration-border-strong underline-offset-4">Find one to bag</Link>.
        </p>
      ) : (
      <div className="divide-y divide-border border border-border">
        {rows.map((r) => (
          <div key={r.positionId}>
            <button type="button" onClick={() => setOpen(open === r.positionId ? null : r.positionId)} className="grid w-full gap-2 p-4 text-left sm:grid-cols-[1.5fr_1fr_1fr_1fr] sm:items-center hover:bg-surface">
              <div>
                <div className="text-sm font-medium">{r.basket.name}</div>
                <div className="num text-[11px] text-faint">{r.boughtAt ? `bought ${new Date(r.boughtAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}` : "no completed buy yet"}</div>
              </div>
              <div className="num text-sm">{usd(r.valueUsd)}</div>
              <div className={`num text-sm ${r.pnlUsd == null ? "text-muted" : r.pnlUsd >= 0 ? "text-gain" : "text-loss"}`}>
                {r.pnlUsd == null ? "—" : `${signed(r.pnlUsd)} (${((r.pnlUsd / r.costUsd) * 100).toFixed(1)}%)`}
              </div>
              <div className="num text-xs text-muted">{r.openOrderId ? <span className="text-accent">open {r.openOrderKind} order</span> : open === r.positionId ? "close" : "details"}</div>
            </button>

            {open === r.positionId && (
              <div className="grid gap-6 border-t border-border p-4 lg:grid-cols-[1.4fr_1fr]">
                <div className="grid gap-3">
                  <table className="num w-full text-xs">
                    <thead className="text-faint">
                      <tr>
                        <th className="pb-2 text-left font-normal">Asset</th>
                        <th className="pb-2 text-right font-normal">Units</th>
                        <th className="pb-2 text-right font-normal">Value</th>
                        <th className="pb-2 text-right font-normal">Now / target</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.holdings.map((h) => (
                        <tr key={h.assetId} className="border-t border-border">
                          <td className="py-1.5">{h.assetId}</td>
                          <td className="py-1.5 text-right">{h.units.toPrecision(5)}</td>
                          <td className="py-1.5 text-right">{usd(h.valueUsd)}</td>
                          <td className="py-1.5 text-right">
                            {(h.weightNowBps / 100).toFixed(1)}% / {(h.targetBps / 100).toFixed(0)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="num break-all text-[10px] text-faint">
                    Basket account {r.accountId} on intents.near{r.recoveryKeyAdded ? " · your wallet is its recovery key" : ""}
                  </div>
                  <ManagePanel positionId={r.positionId} basketId={r.basket.id} onDone={load} />
                  <Link href={`/b/${r.basket.slug}`} className="font-mono text-xs text-muted hover:text-text">
                    Open basket →
                  </Link>
                </div>
                <div>
                  <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-faint">Sell</div>
                  <SellPanel positionId={r.positionId} basketId={r.basket.id} holdings={r.holdings} onDone={load} />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      )}
      </section>

      {hist && <ClosedBags closed={hist.closed} />}
      {hist && <TradeHistory trades={hist.trades} />}
    </div>
  );
}

/** Same layout as the loaded view: two stats, then position rows. */
function PortfolioSkeleton({ note }: { note?: string }) {
  return (
    <Loading label={note ?? "Loading your bags"} className="grid gap-6">
      <div className="flex flex-wrap items-end gap-x-10 gap-y-3">
        {[0, 1].map((i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-2.5 w-20" />
            <Skeleton className="h-7 w-32" />
            <Skeleton className="h-2.5 w-40" />
          </div>
        ))}
      </div>
      <div className="divide-y divide-border border border-border">
        {[0, 1].map((i) => (
          <div key={i} className="grid gap-2 p-4 sm:grid-cols-[1.5fr_1fr_1fr_1fr] sm:items-center">
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-2.5 w-24" />
            </div>
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-12" />
          </div>
        ))}
      </div>
      {note && <LoadingNote>{note}</LoadingNote>}
    </Loading>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-wider text-faint">{label}</div>
      <div className={`num mt-1 text-2xl ${tone ?? ""}`}>{value}</div>
      {sub && <div className="num text-[11px] text-muted">{sub}</div>}
    </div>
  );
}
