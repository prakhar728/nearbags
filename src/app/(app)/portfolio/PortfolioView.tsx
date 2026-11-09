"use client";
import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ManagePanel } from "@/components/trade/ManagePanel";
import { SellPanel } from "@/components/trade/SellPanel";
import { Empty as EmptyState, Section, Stat } from "@/components/ui/Primitives";
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
  if (!user) return <EmptyState title="Connect a wallet">Your bags, P&amp;L and trade history show up here once you sign in.</EmptyState>;
  if (err) return <p className="callout callout-warn text-loss">{err}</p>;
  if (!rows) return <PortfolioSkeleton note="Reading your basket accounts on-chain…" />;
  // No open bags yet: wait for the history before saying "no baskets", or a past trader sees an empty page flash.
  if (!rows.length && h.isPending) return <PortfolioSkeleton note="Loading your trade history…" />;
  if (!rows.length && !hist?.trades.length)
    return (
      <EmptyState
        title="No bags yet"
        actions={
          <Link href="/explore" className="btn btn-primary">
            Find one to bag
          </Link>
        }
      >
        Buy a creator&apos;s basket in one go from any chain. It shows up here with its value, P&amp;L and history.
      </EmptyState>
    );

  const total = rows.reduce((s, r) => s + r.valueUsd, 0);
  const exitAll = rows.every((r) => r.exitUsd != null) ? rows.reduce((s, r) => s + (r.exitUsd ?? 0), 0) : null;
  const cost = rows.reduce((s, r) => s + r.costUsd, 0);
  const pnl = cost > 0 ? (exitAll ?? total) - cost : null;
  const all = hist?.totals;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-10">
      <div className="rise stat-grid grid-cols-1 sm:grid-cols-3" style={{ "--i": 2 } as React.CSSProperties}>
        <Stat
          size="lg"
          label="Holding now"
          value={usd(total)}
          sub={!rows.length ? "no open bags" : exitAll != null ? `sell value ${usd(exitAll)} · ${(((exitAll / total) - 1) * 100).toFixed(1)}% vs market` : "some assets can't be sold right now"}
        />
        {rows.length > 0 && pnl != null ? (
          <Stat size="lg" label="Open P&L" value={signed(pnl)} tone={pnl >= 0 ? "text-gain" : "text-loss"} sub={`on ${usd(cost)} in`} />
        ) : (
          <Stat size="lg" label="Open bags" value={String(rows.length)} sub="nothing held right now" />
        )}
        {all && all.investedUsd > 0 ? (
          <Stat
            size="lg"
            label="All-time P&L"
            value={signed(all.pnlUsd)}
            tone={all.pnlUsd >= 0 ? "text-gain" : "text-loss"}
            sub={`${((all.pnlUsd / all.investedUsd) * 100).toFixed(1)}% · ${usd(all.investedUsd)} in · ${usd(all.returnedUsd)} back`}
          />
        ) : h.isPending ? (
          <div className="space-y-2.5">
            <Skeleton className="h-2.5 w-20" />
            <Skeleton className="h-10 w-36" />
            <Skeleton className="h-2.5 w-40" />
          </div>
        ) : (
          <Stat size="lg" label="All-time P&L" value="—" sub="no completed trades yet" />
        )}
      </div>

      {hist && hist.series.length >= 2 && (
        <Section title="P&L over time" className="rise">
          <div className="card card-pad">
            <PnlChart series={hist.series} />
          </div>
        </Section>
      )}

      <Section title="Open bags" right={rows.length ? <span className="badge">{rows.length} open</span> : undefined}>
        {!rows.length ? (
          <div className="card flex flex-wrap items-center justify-between gap-4 p-5">
            <p className="text-sm text-muted">No open bags right now.</p>
            <Link href="/explore" className="btn btn-primary btn-sm">
              Find one to bag
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
            {rows.map((r) => {
              const isOpen = open === r.positionId;
              return (
                <div key={r.positionId} className={`card overflow-hidden transition-colors ${isOpen ? "border-[var(--line-strong)]" : ""}`}>
                  <div className="flex items-stretch">
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      onClick={() => setOpen(isOpen ? null : r.positionId)}
                      className="grid min-w-0 flex-1 gap-3 p-5 text-left transition-colors hover:bg-[var(--layer-1)] sm:grid-cols-[1.6fr_1fr_1fr_auto] sm:items-center"
                    >
                      <div className="min-w-0">
                        <div className="display truncate text-xl">{r.basket.name}</div>
                        <div className="num mt-1 text-[11px] text-faint">
                          {r.boughtAt ? `bought ${new Date(r.boughtAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}` : "no completed buy yet"}
                        </div>
                      </div>
                      <div>
                        <div className="label">Value</div>
                        <div className="num mt-1 text-base">{usd(r.valueUsd)}</div>
                      </div>
                      <div>
                        <div className="label">P&amp;L</div>
                        <div className={`num mt-1 text-base ${r.pnlUsd == null ? "text-muted" : r.pnlUsd >= 0 ? "text-gain" : "text-loss"}`}>
                          {r.pnlUsd == null ? "—" : `${signed(r.pnlUsd)} (${((r.pnlUsd / r.costUsd) * 100).toFixed(1)}%)`}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {r.openOrderId && <span className="badge badge-accent">open {r.openOrderKind}</span>}
                        <span aria-hidden className={`grid h-9 w-9 place-items-center rounded-full border border-[var(--line)] text-muted transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`}>
                          <svg width="12" height="8" viewBox="0 0 12 8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M1 1.5l5 5 5-5" />
                          </svg>
                        </span>
                      </div>
                    </button>
                    {/* Share actions for an open bag go here (portfolio row). */}
                    <div data-slot="position-actions" className="flex items-center pr-3 empty:hidden" />
                  </div>

                  {isOpen && (
                    <div className="pop grid gap-6 border-t border-[var(--line)] p-5 lg:grid-cols-[1.4fr_1fr]">
                      <div className="grid content-start gap-4">
                        <div className="tbl-wrap">
                          <table className="tbl">
                            <thead>
                              <tr>
                                <th>Asset</th>
                                <th className="r">Units</th>
                                <th className="r">Value</th>
                                <th className="r">Now / target</th>
                              </tr>
                            </thead>
                            <tbody>
                              {r.holdings.map((h) => (
                                <tr key={h.assetId}>
                                  <td className="text-text">{h.assetId}</td>
                                  <td className="r">{h.units.toPrecision(5)}</td>
                                  <td className="r">{usd(h.valueUsd)}</td>
                                  <td className="r">
                                    {(h.weightNowBps / 100).toFixed(1)}% <span className="text-faint">/ {(h.targetBps / 100).toFixed(0)}%</span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="fine break-all">
                          Basket account {r.accountId} on intents.near{r.recoveryKeyAdded ? " · your wallet is its recovery key" : ""}
                        </div>
                        <ManagePanel positionId={r.positionId} basketId={r.basket.id} onDone={load} />
                        <Link href={`/b/${r.basket.slug}`} className="btn btn-ghost btn-sm w-fit px-0 normal-case tracking-normal hover:px-3">
                          Open basket →
                        </Link>
                      </div>
                      <div className="well p-4 sm:p-5">
                        <div className="label mb-3">Sell</div>
                        <SellPanel positionId={r.positionId} basketId={r.basket.id} holdings={r.holdings} onDone={load} />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {hist && <ClosedBags closed={hist.closed} />}
      {hist && <TradeHistory trades={hist.trades} />}
    </div>
  );
}

/** Same layout as the loaded view: three stats, then position rows. */
function PortfolioSkeleton({ note }: { note?: string }) {
  return (
    <Loading label={note ?? "Loading your bags"} className="grid grid-cols-[minmax(0,1fr)] gap-10">
      <div className="stat-grid grid-cols-1 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-2.5">
            <Skeleton className="h-2.5 w-20" />
            <Skeleton className="h-10 w-36" />
            <Skeleton className="h-2.5 w-40" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
        <Skeleton className="h-3 w-28" />
        {[0, 1].map((i) => (
          <div key={i} className="card grid gap-3 p-5 sm:grid-cols-[1.6fr_1fr_1fr_auto] sm:items-center">
            <div className="space-y-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-2.5 w-24" />
            </div>
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-9 w-9 rounded-full" />
          </div>
        ))}
      </div>
      {note && <LoadingNote>{note}</LoadingNote>}
    </Loading>
  );
}
