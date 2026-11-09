// Explore / profile card (spec §5.1).
import Link from "next/link";
import type { BasketView } from "@/lib/baskets";
import type { LiveMetrics } from "@/lib/basket-pages";
import { creatorName, feePct, pct, tone, usd } from "@/lib/format";

export interface CardData {
  basket: BasketView;
  live: { value: number; days: number } | null;
  backtest: { label: string; cagr: number | null; total: number | null } | null;
  metrics: LiveMetrics;
}

export function BasketCard({ basket: b, live, backtest, metrics }: CardData) {
  const tickers = b.assets.map((a) => a.assetId);
  const shown = tickers.slice(0, 4);
  return (
    <Link href={`/b/${b.slug}`} className="group flex h-full flex-col gap-3 border border-border bg-bg p-4 transition-colors hover:border-border-strong">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-base font-medium group-hover:text-accent">{b.name}</h3>
            {b.status === "closed" && <Tag>Closed</Tag>}
          </div>
          <p className="mt-1 line-clamp-2 text-sm text-muted">&ldquo;{b.tagline}&rdquo;</p>
        </div>
        <span className="num shrink-0 text-xs text-faint">by {creatorName(b.creator)}</span>
      </div>

      <div className="num text-xs text-muted">
        {shown.join(" · ")}
        {tickers.length > shown.length && <span className="text-faint"> · +{tickers.length - shown.length}</span>}
      </div>

      <div className="num mt-auto flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
        <span>
          <span className="text-faint">Live </span>
          {live ? (
            <>
              <span className={tone(live.value)}>{pct(live.value)}</span> <span className="text-faint">({live.days}d)</span>
            </>
          ) : (
            <span className="text-muted">—</span>
          )}
        </span>
        <span className="text-border-strong">·</span>
        <span>
          <span className="text-faint">Backtest {backtest?.label ?? ""} </span>
          {backtest?.cagr != null ? (
            <span className={tone(backtest.cagr)}>{pct(backtest.cagr, 0)}/yr</span>
          ) : backtest?.total != null ? (
            <span className={tone(backtest.total)}>{pct(backtest.total, 0)}</span>
          ) : (
            <span className="text-muted">—</span>
          )}
        </span>
      </div>

      <div className="num flex flex-wrap gap-x-2 gap-y-1 border-t border-border pt-3 text-[11px] text-muted">
        <span>{metrics.tvlUsd == null ? "—" : usd(metrics.tvlUsd, { compact: true })} held</span>
        <span className="text-faint">·</span>
        <span>{metrics.holders ?? "—"} holders</span>
        <span className="text-faint">·</span>
        <span>fee {feePct(b.feeBps)}</span>
        <span className="text-faint">·</span>
        <span>min ${b.minBuyUsd}</span>
        <span className="text-faint">·</span>
        {b.isHouse ? <span className="text-text">House basket</span> : <span>creator holds —</span>}
      </div>
    </Link>
  );
}

export function Tag({ children, tone: t = "muted" }: { children: React.ReactNode; tone?: "muted" | "accent" | "loss" }) {
  const cls = t === "accent" ? "border-accent text-accent" : t === "loss" ? "border-loss/60 text-loss" : "border-border-strong text-muted";
  return <span className={`num inline-block shrink-0 border px-1.5 py-px text-[10px] uppercase tracking-wider ${cls}`}>{children}</span>;
}
