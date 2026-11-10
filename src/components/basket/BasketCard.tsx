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
        <div className="flex flex-wrap items-center gap-1.5">
          {b.status === "closed" ? <Tag>Closed</Tag> : b.isHouse ? <Tag>House</Tag> : <Tag tone="accent">Live</Tag>}
          {b.agent && <Tag>AI agent</Tag>}
          <span className="badge border-transparent px-0 normal-case tracking-normal text-faint">by {creatorName(b.creator)}</span>
        </div>
        <span
          aria-hidden
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-[var(--line)] text-muted transition-all duration-300 group-hover:rotate-[-45deg] group-hover:border-accent group-hover:bg-accent group-hover:text-accent-ink"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </span>
      </div>

      <div className="space-y-2">
        <h3 className="display text-[26px] leading-[1.02] transition-colors group-hover:text-accent">{b.name}</h3>
        <p className="line-clamp-2 text-sm leading-relaxed text-muted">{b.tagline}</p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {shown.map((t) => (
          <span key={t} className="chip h-7 px-2.5 text-[10.5px]">
            {t}
          </span>
        ))}
        {tickers.length > shown.length && <span className="chip h-7 px-2.5 text-[10.5px] text-faint">+{tickers.length - shown.length}</span>}
      </div>

      <div className="mt-auto flex items-end justify-between gap-4">
        <div>
          <div className="label">Backtest {backtest?.label ?? ""}{backtest?.cagr != null ? " · per yr" : ""}</div>
          <div className={`big-num mt-2 text-[34px] ${headline == null ? "text-muted" : headline >= 0 ? "text-accent" : "text-loss"}`}>
            {headline == null ? "—" : pct(headline, 0)}
          </div>
        </div>
        <div className="text-right">
          <div className="label">Live</div>
          <div className="num mt-2 text-sm">
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

      <div className="num flex flex-wrap gap-x-3 gap-y-1 border-t border-[var(--line)] pt-4 text-[11px] text-muted">
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
  const cls = t === "accent" ? "badge-accent" : t === "loss" ? "badge-loss" : "";
  return <span className={`badge ${cls}`}>{children}</span>;
}
