// Basket page, "the terminal" (spec §5.2). The basket itself is a cached, tagged read so a missing slug can
// 404 before streaming starts; analytics, live numbers and the edit log stream in behind Suspense.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { BacktestView } from "@/components/basket/BacktestView";
import { Tag } from "@/components/basket/BasketCard";
import { CreatorTools } from "@/components/basket/CreatorTools";
import { Label, Pairs } from "@/components/basket/Pairs";
import { Markdown } from "@/components/Markdown";
import { BuyPanel } from "@/components/trade/BuyPanel";
import { getAnalyticsView, getLiveReturn } from "@/lib/analytics/cached";
import { getAsset } from "@/lib/assets";
import { getBasketPage, liveMetrics, type BasketEdit } from "@/lib/basket-pages";
import { daysSince } from "@/lib/cards";
import { FIELD_LABEL, HORIZON_LABEL } from "@/lib/basket-text";
import type { BasketView } from "@/lib/baskets";
import { ago, creatorHref, creatorName, feePct, pct, tone, usd } from "@/lib/format";

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
    <div className="space-y-12">
      <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
        <Header b={b} />
        <div className="space-y-3 lg:sticky lg:top-6 lg:self-start">
          <BuyPanel basket={{ id: b.id, slug: b.slug, name: b.name, feeBps: b.feeBps, minBuyUsd: b.minBuyUsd, status: b.status, assets: weightsOf(b) }} />
          <p className="num text-[11px] leading-relaxed text-faint">
            Min buy ${b.minBuyUsd} · creator fee {feePct(b.feeBps)} + platform fee on buys · selling is free.
          </p>
        </div>
      </div>

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

      <Suspense fallback={<Box className="h-[640px]" label="Running the backtest…" />}>
        <Analytics b={b} />
      </Suspense>

      <Section title="Holdings">
        <Holdings b={b} />
      </Section>

      <Section title="Thesis">
        <Markdown text={b.thesis} />
      </Section>
      <div className="grid gap-12 md:grid-cols-2">
        <Section title="Risks">
          <Markdown text={b.risks} />
        </Section>
        <Section title="Exit signal">{b.exitSignal ? <Markdown text={b.exitSignal} /> : <p className="text-sm text-muted">None given.</p>}</Section>
      </div>
      {b.deepDive && (
        <details className="group border-t border-border pt-6">
          <summary className="cursor-pointer list-none font-mono text-[11px] uppercase tracking-wider text-muted hover:text-text">
            <span className="group-open:hidden">+ Deep dive</span>
            <span className="hidden group-open:inline">− Deep dive</span>
          </summary>
          <div className="mt-4 max-w-3xl">
            <Markdown text={b.deepDive} />
          </div>
        </details>
      )}

      <Section title="Live track record">
        <Suspense fallback={<Box className="h-20" />}>
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
    <div className="min-w-0 space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {statusTag}
        {b.isHouse && <Tag>House basket</Tag>}
      </div>
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{b.name}</h1>
        <p className="max-w-2xl text-base text-muted">{b.tagline}</p>
      </div>
      <dl className="num grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:flex sm:flex-wrap">
        <Meta k="Creator">
          <Link href={creatorHref(b.creator)} className="hover:text-accent">
            {creatorName(b.creator)}
          </Link>
        </Meta>
        <Meta k="Fee">{feePct(b.feeBps)}</Meta>
        <Meta k="Horizon">{HORIZON_LABEL[b.horizon]}</Meta>
        <Meta k="Min buy">${b.minBuyUsd}</Meta>
        <Meta k={b.isHouse ? "Self-buy" : "Creator holds"}>{b.isHouse ? <span className="text-muted">House basket, none</span> : <Suspense fallback={<span className="text-muted">…</span>}><CreatorHolds id={b.id} /></Suspense>}</Meta>
      </dl>
      <div className="num flex flex-wrap gap-1.5 text-xs">
        {b.assets.map((a) => (
          <span key={a.assetId} className="border border-border px-2 py-1">
            {a.assetId} <span className="text-faint">{a.weightBps / 100}%</span>
          </span>
        ))}
      </div>
      {b.status === "pending" && (
        <p className="border-l-2 border-border-strong pl-3 text-sm text-muted">Not live yet. It goes live once the creator buys at least ${b.minBuyUsd} of it.</p>
      )}
      {b.status === "closed" && <p className="border-l-2 border-border-strong pl-3 text-sm text-muted">Closed to new buyers. Holders can still sell and withdraw.</p>}
      {b.status === "hidden" && <p className="border-l-2 border-loss/60 pl-3 text-sm text-muted">Hidden by an admin: off Explore, no new buys. Holders can still sell and withdraw.</p>}
    </div>
  );
}

function Meta({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-mono text-[10px] uppercase tracking-wider text-faint">{k}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

async function Analytics({ b }: { b: BasketView }) {
  const a = await getAnalyticsView(weightsOf(b));
  if ("error" in a) return <Box label={`Backtest unavailable: ${a.error}`} />;
  return (
    <div className="space-y-12">
      <BacktestView a={a} />
      <Section title="Pairs">
        <Pairs a={a} />
      </Section>
    </div>
  );
}

function Holdings({ b }: { b: BasketView }) {
  return (
    <div className="border-t border-border">
      {b.assets.map((a) => {
        const asset = getAsset(a.assetId);
        return (
          <div key={a.assetId} className="grid grid-cols-[4.5rem_3.5rem_1fr] gap-x-4 gap-y-1 border-b border-border py-3 text-sm sm:grid-cols-[5rem_10rem_4rem_1fr]">
            <div className="num">{a.assetId}</div>
            <div className="hidden text-muted sm:block">{asset.name}</div>
            <div className="num text-accent">{a.weightBps / 100}%</div>
            <div className="col-span-3 text-muted sm:col-span-1">{a.why || "—"}</div>
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
      <div className="grid grid-cols-2 border-l border-t border-border sm:grid-cols-4">
        <Cell k={`Since live · ${days}d`}>
          <span className={tone(live?.value)}>{pct(live?.value)}</span>
        </Cell>
        <Cell k="Held">{m.tvlUsd == null ? "—" : usd(m.tvlUsd, { compact: true })}</Cell>
        <Cell k="Holders">{m.holders ?? "—"}</Cell>
        <Cell k="Net flow · 7d">{usd(m.inflow7dUsd, { compact: true })}</Cell>
      </div>
      <p className="mt-2 font-mono text-[10px] leading-relaxed text-faint">
        Live = buy-and-hold index since {b.publishedAt.slice(0, 10)} on median reference closes{live ? ` (latest ${live.asOf})` : ""}. Held and holders are read from every
        basket account on intents.near, refreshed every few minutes.
      </p>
    </div>
  );
}

function Cell({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-r border-border p-3">
      <div className="font-mono text-[10px] uppercase tracking-wider text-faint">{k}</div>
      <div className="num mt-1 text-base">{children}</div>
    </div>
  );
}

async function EditLog({ edits, publishedAt }: { edits: BasketEdit[]; publishedAt: string | null }) {
  if (!edits.length) return null;
  await connection(); // "2d ago" is relative to now
  const label = (f: string) => (f.startsWith("why:") ? `Why ${f.slice(4)}` : (FIELD_LABEL[f] ?? f));
  return (
    <details className="group border-t border-border pt-6">
      <summary className="cursor-pointer list-none font-mono text-[11px] text-muted hover:text-text">
        Edited {ago(edits[0].editedAt)} · <span className="underline decoration-border-strong underline-offset-4 group-open:hidden">view history</span>
        <span className="hidden underline decoration-border-strong underline-offset-4 group-open:inline">hide history</span>
      </summary>
      <ol className="mt-4 space-y-4">
        {edits.map((e, i) => (
          <li key={i} className="border-l border-border pl-4">
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
      {publishedAt && <p className="mt-4 font-mono text-[10px] text-faint">Assets, weights, fee and name are frozen since {publishedAt.slice(0, 10)}.</p>}
    </details>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <Label>{title}</Label>
      {children}
    </section>
  );
}

function Box({ label, className = "" }: { label?: string; className?: string }) {
  return <div className={`flex items-center justify-center border border-border font-mono text-xs text-faint ${className || "p-6"}`}>{label}</div>;
}
