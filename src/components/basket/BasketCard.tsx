// Explore / profile card (spec §5.1).
import Link from "next/link";
import type { BasketView } from "@/lib/baskets";
import type { LiveMetrics } from "@/lib/basket-pages";
import { creatorName, feePct, pct, tone, usd } from "@/lib/format";
import { AssetLogo } from "@/components/AssetLogo";

export interface CardData {
  basket: BasketView;
  live: { value: number; days: number } | null;
  backtest: { label: string; cagr: number | null; total: number | null } | null;
  metrics: LiveMetrics;
}

export function BasketCard({ basket: b, live, backtest, metrics, i = 0 }: CardData & { i?: number }) {
  const tickers = b.assets.map((a) => a.assetId);
  const shown = tickers.slice(0, 5);
  const headline = backtest?.cagr != null ? backtest.cagr : (backtest?.total ?? null);
  return (
    <Link
      href={`/b/${b.slug}`}
      className="card card-hover rise group flex h-full flex-col gap-5 p-5 sm:p-6"
      style={{ "--i": Math.min(i, 8) } as React.CSSProperties}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center" aria-hidden>
          {shown.map((t) => (
            <AssetLogo key={t} id={t} size={32} className="-mr-2 ring-2 ring-[var(--elev)]" />
          ))}
          {tickers.length > shown.length && (
            <span className="num -mr-2 grid h-8 min-w-8 place-items-center rounded-full bg-[var(--surface-2)] px-1.5 text-[11px] font-semibold text-muted ring-2 ring-[var(--elev)]">
              +{tickers.length - shown.length}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {b.agent && <Tag>AI agent</Tag>}
          {b.status === "closed" ? <Tag>Closed</Tag> : b.isHouse ? <Tag>House</Tag> : <Tag tone="accent">Live</Tag>}
        </div>
      </div>

      <div className="space-y-1.5">
        <h3 className="display text-[22px] leading-tight">{b.name}</h3>
        <p className="line-clamp-2 text-sm leading-relaxed text-muted">{b.tagline}</p>
        <p className="num truncate text-[13px] text-muted">
          {tickers.join(" · ")} <span className="text-faint">· by {creatorName(b.creator)}</span>
        </p>
      </div>

      <div className="mt-auto flex items-end justify-between gap-4 rounded-[var(--r-md)] bg-[var(--surface)] px-4 py-3.5">
        <div>
          <div className="label">Backtest {backtest?.label ?? ""}{backtest?.cagr != null ? " · per yr" : ""}</div>
          <div className={`big-num mt-1.5 text-[30px] ${headline == null ? "text-muted" : headline >= 0 ? "text-gain" : "text-loss"}`}>
            {headline == null ? "—" : pct(headline, 0)}
          </div>
        </div>
        <div className="text-right">
          <div className="label">Live</div>
          <div className="num mt-1.5 text-sm font-medium">
            {live ? (
              <>
                <span className={tone(live.value)}>{pct(live.value)}</span> <span className="text-faint">{live.days}d</span>
              </>
            ) : (
              <span className="text-muted">—</span>
            )}
          </div>
        </div>
      </div>

      <div className="num flex flex-wrap gap-x-3 gap-y-1 text-[12.5px] text-muted">
        <span>
          <span className="text-text">{metrics.tvlUsd == null ? "—" : usd(metrics.tvlUsd, { compact: true })}</span> held
        </span>
        <span>
          <span className="text-text">{metrics.holders ?? "—"}</span> holders
        </span>
        <span>
          fee <span className="text-text">{feePct(b.feeBps)}</span>
        </span>
        <span>
          min <span className="text-text">${b.minBuyUsd}</span>
        </span>
        {!b.isHouse && (
          <span>
            creator holds <span className="text-text">{metrics.creatorHoldsUsd == null ? "—" : usd(metrics.creatorHoldsUsd, { compact: true })}</span>
          </span>
        )}
      </div>
    </Link>
  );
}

export function Tag({ children, tone: t = "muted" }: { children: React.ReactNode; tone?: "muted" | "accent" | "loss" }) {
  const cls = t === "accent" ? "badge-accent badge-dot" : t === "loss" ? "badge-loss" : "";
  return <span className={`badge ${cls}`}>{children}</span>;
}
