// Basket page, "the terminal" (spec §5.2). The basket itself is a cached, tagged read so a missing slug can
// 404 before streaming starts; analytics, live numbers and the edit log stream in behind Suspense.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { BacktestView } from "@/components/basket/BacktestView";
import { Tag } from "@/components/basket/BasketCard";
import { AgentPanel } from "@/components/basket/AgentPanel";
import { CreatorTools } from "@/components/basket/CreatorTools";
import { BacktestSkeleton, CellsSkeleton } from "@/components/basket/Skeletons";
import { Pairs } from "@/components/basket/Pairs";
import { Card, Section as UISection } from "@/components/ui/Primitives";
import { Markdown } from "@/components/Markdown";
import { Loading, SkeletonText } from "@/components/ui/Skeleton";
import { BuyPanel } from "@/components/trade/BuyPanel";
import { StickyBuy } from "@/components/trade/StickyBuy";
import { ShareBasket } from "@/components/share/ShareBasket";
import { getAnalyticsView, getLiveReturn } from "@/lib/analytics/cached";
import { getAsset } from "@/lib/assets";
import { listOf, paused } from "@/lib/trade/availability";
import { getBasketPage, liveMetrics, type BasketEdit } from "@/lib/basket-pages";
import { daysSince } from "@/lib/cards";
import { FIELD_LABEL, HORIZON_LABEL } from "@/lib/basket-text";
import type { BasketView } from "@/lib/baskets";
import { ago, creatorHref, creatorName, feePct, pct, tone, usd } from "@/lib/format";
import { AssetLogo } from "@/components/AssetLogo";
import { assetColor } from "@/lib/palette";

export async function generateMetadata({ params }: PageProps<"/b/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const data = await getBasketPage(slug);
  return data ? { title: `${data.basket.name} · Stonkbag`, description: data.basket.tagline } : { title: "Not found · Stonkbag" };
}

// The page awaits params outside Suspense so an unknown slug gets a real 404 status (not a streamed 200).
// The basket read is cached and tagged, so the blocking part is short; everything heavy streams.
export const instant = false;

const weightsOf = (b: BasketView) => b.assets.map(({ assetId, weightBps }) => ({ assetId, weightBps }));

export default async function BasketPage({ params }: PageProps<"/b/[slug]">) {
  const { slug } = await params;
  const data = await getBasketPage(slug);
  if (!data) notFound();
  const { basket: b, edits } = data;

  return (
    <div className="space-y-14">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-10">
        <Header b={b} />
        <div id="buy" className="rise scroll-mt-20 space-y-3 lg:sticky lg:top-24 lg:self-start" style={{ "--i": 2 } as React.CSSProperties}>
          <BuyPanel basket={{ id: b.id, slug: b.slug, name: b.name, feeBps: b.feeBps, minBuyUsd: b.minBuyUsd, status: b.status, assets: weightsOf(b), agentManaged: !!b.agent }} />
          <p className="fine px-1">
            Min buy ${b.minBuyUsd} · creator fee {feePct(b.feeBps)} + platform fee on buys · selling is free.
          </p>
        </div>
      </div>
      {(b.status === "live" || b.status === "pending") && <StickyBuy targetId="buy" minBuyUsd={b.minBuyUsd} />}

      <CreatorTools
        basket={{
          slug: b.slug,
          creatorId: b.creator.id,
          status: b.status,
          minBuyUsd: b.minBuyUsd,
          tagline: b.tagline,
          thesis: b.thesis,
          risks: b.risks,
          exitSignal: b.exitSignal,
          deepDive: b.deepDive,
          assets: b.assets.map(({ assetId, why }) => ({ assetId, why })),
        }}
      />

      {b.agent && <AgentPanel basketId={b.id} creatorId={b.creator.id} limits={b.agent.limits} />}

      <Suspense fallback={<BacktestSkeleton assets={b.assets.length} />}>
        <Analytics b={b} />
      </Suspense>

      <Section title="Holdings">
        <Holdings b={b} />
      </Section>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card ticks className="lg:row-span-2">
          <Section title="Thesis">
            <Markdown text={b.thesis} />
          </Section>
        </Card>
        <Card>
          <Section title="Risks">
            <Markdown text={b.risks} />
          </Section>
        </Card>
        <Card>
          <Section title="Exit signal">{b.exitSignal ? <Markdown text={b.exitSignal} /> : <p className="text-sm text-muted">None given.</p>}</Section>
        </Card>
      </div>
      {b.deepDive && (
        <details className="disclosure card group overflow-hidden">
          <summary className="flex min-h-14 items-center justify-between gap-3 px-5 sm:px-6">
            <span className="label text-muted">Deep dive</span>
            <span aria-hidden className="grid h-8 w-8 place-items-center rounded-full border border-[var(--line)] text-muted transition-transform duration-300 group-open:rotate-45">+</span>
          </summary>
          <div className="max-w-3xl px-5 pb-6 sm:px-6">
            <Markdown text={b.deepDive} />
          </div>
        </details>
      )}

      <Section title="Live track record">
        <Suspense fallback={<Loading label="Reading live numbers"><CellsSkeleton cells={4} /></Loading>}>
          <LiveTrack b={b} />
        </Suspense>
      </Section>

      <Suspense fallback={null}>
        <EditLog edits={edits} publishedAt={b.publishedAt} />
      </Suspense>
    </div>
  );
}

function Header({ b }: { b: BasketView }) {
  const statusTag =
    b.status === "live" ? <Tag tone="accent">Live</Tag> : b.status === "pending" ? <Tag>Pending</Tag> : b.status === "closed" ? <Tag>Closed</Tag> : <Tag tone="loss">Hidden</Tag>;
  return (
    <div className="min-w-0 space-y-7">
      <div className="rise relative z-20 flex flex-wrap items-center justify-between gap-3" style={{ "--i": 0 } as React.CSSProperties}>
        <div className="flex flex-wrap items-center gap-2">
          {statusTag}
          {b.isHouse && <Tag>House basket</Tag>}
          {b.agent && <Tag tone="accent">AI agent</Tag>}
        </div>
        <div data-slot="basket-actions" className="flex flex-wrap items-center gap-2">
          {(b.status === "live" || b.status === "closed") && <ShareBasket slug={b.slug} name={b.name} tagline={b.tagline} />}
        </div>
      </div>
      <div className="rise space-y-3" style={{ "--i": 1 } as React.CSSProperties}>
        <h1 className="display text-[clamp(40px,7vw,76px)]">{b.name}</h1>
        <p className="max-w-2xl text-lg leading-relaxed text-muted">{b.tagline}</p>
      </div>
      <dl className="rise stat-grid grid-cols-2 sm:grid-cols-5 max-sm:[&>*:last-child]:col-span-2" style={{ "--i": 2 } as React.CSSProperties}>
        <Meta k="Creator">
          <Link href={creatorHref(b.creator)} className="text-accent-fg hover:underline">
            {creatorName(b.creator)}
          </Link>
        </Meta>
        <Meta k="Fee">{feePct(b.feeBps)}</Meta>
        <Meta k="Horizon">{HORIZON_LABEL[b.horizon]}</Meta>
        <Meta k="Min buy">${b.minBuyUsd}</Meta>
        <Meta k={b.isHouse ? "Self-buy" : "Creator holds"}>{b.isHouse ? <span className="text-muted">House basket, none</span> : <Suspense fallback={<SkeletonText className="w-12" />}><CreatorHolds id={b.id} /></Suspense>}</Meta>
      </dl>
      <div className="rise space-y-3" style={{ "--i": 3 } as React.CSSProperties}>
        <div className="flex h-2.5 overflow-hidden rounded-full bg-[var(--layer-2)]" aria-hidden>
          {b.assets.map((a, i) => (
            <div key={a.assetId} className="h-full border-r-2 border-bg last:border-r-0" style={{ width: `${a.weightBps / 100}%`, background: assetColor(i) }} />
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {b.assets.map((a) => (
            <span key={a.assetId} className="chip gap-1.5 pl-1.5">
              <AssetLogo id={a.assetId} size={20} />
              <span className="text-text">{a.assetId}</span> {a.weightBps / 100}%
            </span>
          ))}
        </div>
      </div>
      {b.status === "pending" && <p className="callout">Not live yet. It goes live once the creator buys at least ${b.minBuyUsd} of it.</p>}
      {b.status === "closed" && <p className="callout">Closed to new buyers. Holders can still sell and withdraw.</p>}
      {b.status === "hidden" && <p className="callout callout-warn">Hidden by an admin: off Explore, no new buys. Holders can still sell and withdraw.</p>}
      {(b.status === "live" || b.status === "pending" || b.status === "closed") && (
        <Suspense fallback={null}>
          <TradingNotice b={b} />
        </Suspense>
      )}
    </div>
  );
}

/** Shown only while 1Click refuses to buy or sell one of the basket's assets (checked live, cached 10 minutes). */
async function TradingNotice({ b }: { b: BasketView }) {
  await connection();
  const p = await paused(b.assets.map((a) => a.assetId)).catch(() => ({ cantBuy: [] as string[], cantSell: [] as string[] }));
  if (!p.cantBuy.length && !p.cantSell.length) return null;
  const both = p.cantBuy.filter((id) => p.cantSell.includes(id));
  const buyOnly = p.cantBuy.filter((id) => !both.includes(id));
  const sellOnly = p.cantSell.filter((id) => !both.includes(id));
  const parts = [
    both.length ? `${listOf(both)} can't be traded at all` : "",
    buyOnly.length ? `${listOf(buyOnly)} can't be bought` : "",
    sellOnly.length ? `${listOf(sellOnly)} can't be sold` : "",
  ].filter(Boolean);
  return (
    <div className="callout callout-warn space-y-1.5" role="status">
      <p className="font-medium text-text">Trading paused: {parts.join("; ")} on NEAR Intents right now.</p>
      <p className="text-sm">
        New buys of this basket are paused until every asset can be bought and sold again, so nobody ends up holding something they can&rsquo;t
        sell.{p.cantSell.length ? " Holders can sell once it returns." : ""}{b.agent ? " The agent skips its runs meanwhile." : ""} Holdings stay safe in each
        holder&rsquo;s own account. This notice clears by itself.
      </p>
    </div>
  );
}

function Meta({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="label">{k}</dt>
      <dd className="num mt-1.5 truncate text-sm">{children}</dd>
    </div>
  );
}

async function Analytics({ b }: { b: BasketView }) {
  const a = await getAnalyticsView(weightsOf(b));
  if ("error" in a) return <Box label={`Backtest unavailable: ${a.error}`} />;
  return (
    <div className="space-y-14">
      <BacktestView a={a} />
      <Section title="Pairs">
        <Card>
          <Pairs a={a} />
        </Card>
      </Section>
    </div>
  );
}

function Holdings({ b }: { b: BasketView }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {b.assets.map((a) => {
        const asset = getAsset(a.assetId);
        return (
          <div key={a.assetId} className="card card-hover flex gap-4 p-4 sm:p-5">
            <AssetLogo id={a.assetId} size={48} className="ring-1 ring-[var(--line-strong)]" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <div className="truncate text-sm font-medium">
                  {a.assetId} <span className="font-normal text-muted">{asset.name}</span>
                </div>
                <div className="big-num shrink-0 text-xl text-accent-fg">{a.weightBps / 100}%</div>
              </div>
              <div className="bar-track h-1.5">
                <div className="bar-fill bg-accent/70" style={{ left: 0, width: `${a.weightBps / 100}%` }} />
              </div>
              <p className="text-sm leading-relaxed text-muted">{a.why || "—"}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

async function CreatorHolds({ id }: { id: number }) {
  await connection();
  const m = (await liveMetrics([id])).get(id)!;
  return <span className="num">{m.creatorHoldsUsd == null ? "—" : usd(m.creatorHoldsUsd)}</span>;
}

async function LiveTrack({ b }: { b: BasketView }) {
  await connection();
  if (!b.publishedAt) return <p className="text-sm text-muted">Starts when the basket goes live.</p>;
  const [live, metrics] = await Promise.all([getLiveReturn(weightsOf(b), b.publishedAt), liveMetrics([b.id])]);
  const m = metrics.get(b.id)!;
  const days = daysSince(b.publishedAt);
  return (
    <div>
      <div className="stat-grid grid-cols-2 sm:grid-cols-4">
        <Cell k={`Since live · ${days}d`}>
          <span className={tone(live?.value)}>{pct(live?.value)}</span>
        </Cell>
        <Cell k="Held">{m.tvlUsd == null ? "—" : usd(m.tvlUsd, { compact: true })}</Cell>
        <Cell k="Holders">{m.holders ?? "—"}</Cell>
        <Cell k="Net flow · 7d">{usd(m.inflow7dUsd, { compact: true })}</Cell>
      </div>
      <p className="fine mt-3">
        Live = buy-and-hold index since {b.publishedAt.slice(0, 10)} on median reference closes{live ? ` (latest ${live.asOf})` : ""}. Held and holders are read from every
        basket account on intents.near, refreshed every few minutes.
      </p>
    </div>
  );
}

function Cell({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="label">{k}</div>
      <div className="stat-value text-xl">{children}</div>
    </div>
  );
}

async function EditLog({ edits, publishedAt }: { edits: BasketEdit[]; publishedAt: string | null }) {
  if (!edits.length) return null;
  await connection(); // "2d ago" is relative to now
  const label = (f: string) => (f.startsWith("why:") ? `Why ${f.slice(4)}` : (FIELD_LABEL[f] ?? f));
  return (
    <details className="disclosure card card-pad group">
      <summary className="text-[13px] font-medium text-muted hover:text-text">
        Edited {ago(edits[0].editedAt)} · <span className="underline decoration-border-strong underline-offset-4 group-open:hidden">view history</span>
        <span className="hidden underline decoration-border-strong underline-offset-4 group-open:inline">hide history</span>
      </summary>
      <ol className="mt-4 space-y-4">
        {edits.map((e, i) => (
          <li key={i} className="border-l-2 border-[var(--line-strong)] pl-4">
            <div className="num text-[11px] text-faint">
              {e.editedAt.slice(0, 16).replace("T", " ")} UTC · {label(e.field)}
            </div>
            <div className="mt-1 grid gap-2 text-xs md:grid-cols-2">
              <div className="whitespace-pre-wrap break-words text-faint line-through decoration-faint/50">{e.oldValue || "(empty)"}</div>
              <div className="whitespace-pre-wrap break-words text-muted">{e.newValue || "(empty)"}</div>
            </div>
          </li>
        ))}
      </ol>
      {publishedAt && <p className="fine mt-4">Assets, weights, fee and name are frozen since {publishedAt.slice(0, 10)}.</p>}
    </details>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <UISection title={title}>{children}</UISection>;
}

function Box({ label, className = "" }: { label?: string; className?: string }) {
  return <div className={`card flex items-center justify-center text-sm text-muted ${className || "p-6"}`}>{label}</div>;
}
