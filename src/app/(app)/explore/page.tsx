// Explore (spec §5.1): tabs Trending / Top performers / Most held / New, filters by kind and max fee.
// Tabs and filters live in searchParams so every view is a link.
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { BasketCard } from "@/components/basket/BasketCard";
import { CardGridSkeleton } from "@/components/basket/Skeletons";
import { Empty as EmptyState, PageHeader } from "@/components/ui/Primitives";
import { Skeleton } from "@/components/ui/Skeleton";
import { listExploreBaskets } from "@/lib/basket-pages";
import { basketKind, type BasketKind } from "@/lib/basket-kind";
import { ageDays, cardData } from "@/lib/cards";
import { feePct } from "@/lib/format";

const TABS = [
  { id: "trending", label: "Trending" },
  { id: "top", label: "Top performers" },
  { id: "held", label: "Most held" },
  { id: "new", label: "New" },
] as const;
type Tab = (typeof TABS)[number]["id"];
const KINDS: { id: BasketKind | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "stocks", label: "Stocks" },
  { id: "crypto", label: "Crypto" },
  { id: "mixed", label: "Mixed" },
];
const FEES = [null, 0, 25, 50] as const;
const MIN_AGE_DAYS = 7;

interface Q {
  tab: Tab;
  kind: BasketKind | "all";
  fee: number | null;
}

function parse(sp: Record<string, string | string[] | undefined>): Q {
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : (sp[k] as string | undefined));
  const tab = TABS.find((t) => t.id === one("tab"))?.id ?? "trending";
  const kind = KINDS.find((k) => k.id === one("kind"))?.id ?? "all";
  const feeRaw = one("fee");
  const fee = feeRaw != null && FEES.includes(Number(feeRaw) as never) ? Number(feeRaw) : null;
  return { tab, kind, fee };
}

function href(q: Q, patch: Partial<Q>) {
  const n = { ...q, ...patch };
  const p = new URLSearchParams();
  if (n.tab !== "trending") p.set("tab", n.tab);
  if (n.kind !== "all") p.set("kind", n.kind);
  if (n.fee != null) p.set("fee", String(n.fee));
  const s = p.toString();
  return s ? `/explore?${s}` : "/explore";
}

export default function Explore({ searchParams }: PageProps<"/">) {
  return (
    <div className="space-y-10">
      <PageHeader
        kicker="Explore · stocks + crypto"
        title={
          <>
            Bag it. Any chain. <em>Your keys.</em>
          </>
        }
        description="Creator-made baskets of tokenized US stocks and crypto. Buy the whole bag in one go. Every position sits in its own NEAR Intents account that only you control."
      />
      <Suspense fallback={<ExploreSkeleton />}>
        <ExploreBody searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function ExploreBody({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const q = parse(await searchParams);
  await connection();
  const all = await listExploreBaskets();
  const filtered = all.filter((b) => (q.kind === "all" || basketKind(b.assets) === q.kind) && (q.fee == null || b.feeBps <= q.fee));
  const pool = q.tab === "top" ? filtered.filter((b) => ageDays(b) >= MIN_AGE_DAYS) : filtered;
  const cards = await cardData(pool);

  const newest = (a: (typeof cards)[number], b: (typeof cards)[number]) => Date.parse(b.basket.publishedAt ?? "0") - Date.parse(a.basket.publishedAt ?? "0");
  let note: string | null = null;
  if (q.tab === "trending") {
    cards.sort((a, b) => b.metrics.inflow7dUsd - a.metrics.inflow7dUsd || newest(a, b));
    if (cards.every((c) => c.metrics.inflow7dUsd === 0)) note = "No money has moved in the last 7 days. Sorted by newest until it does.";
  } else if (q.tab === "top") {
    cards.sort((a, b) => (b.live?.value ?? -Infinity) - (a.live?.value ?? -Infinity));
  } else if (q.tab === "held") {
    cards.sort((a, b) => (b.metrics.tvlUsd ?? -1) - (a.metrics.tvlUsd ?? -1) || newest(a, b));
    if (cards.every((c) => !c.metrics.tvlUsd)) note = "Nothing held yet. Sorted by newest until there is.";
  } else cards.sort(newest);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <nav className="seg" aria-label="Explore tabs">
          {TABS.map((t) => (
            <Link key={t.id} href={href(q, { tab: t.id })} aria-current={q.tab === t.id ? "page" : undefined} className="seg-item">
              {t.label}
            </Link>
          ))}
        </nav>
        <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center md:gap-x-5">
          <FilterGroup label="Type">
            {KINDS.map((k) => (
              <Chip key={k.id} href={href(q, { kind: k.id })} on={q.kind === k.id}>
                {k.label}
              </Chip>
            ))}
          </FilterGroup>
          <FilterGroup label="Max fee">
            {FEES.map((f) => (
              <Chip key={String(f)} href={href(q, { fee: f })} on={q.fee === f}>
                {f == null ? "Any" : feePct(f)}
              </Chip>
            ))}
          </FilterGroup>
        </div>
      </div>

      {note && <p className="fine flex items-center gap-2">{note}</p>}

      {cards.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {cards.map((c, i) => (
            <BasketCard key={c.basket.id} {...c} i={i} />
          ))}
        </div>
      ) : (
        <Empty q={q} total={filtered.length} />
      )}

      <p className="fine">
        Live = buy-and-hold since the basket went live, on median reference prices. Backtest = historical, not a forecast. Held and holders are read from basket accounts on-chain.
      </p>
    </div>
  );
}

function Empty({ q, total }: { q: Q; total: number }) {
  const msg =
    q.tab === "top" && total > 0
      ? `Nothing here is ${MIN_AGE_DAYS} days old yet. Top performers ranks live returns once a basket has a week of history.`
      : "No baskets match these filters.";
  return (
    <EmptyState
      title="Nothing here yet"
      actions={
        <>
          <Link href="/explore?tab=new" className="btn btn-secondary btn-sm">See newest</Link>
          <Link href="/create" className="btn btn-primary btn-sm">Make one</Link>
        </>
      }
    >
      {msg}
    </EmptyState>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="scroll-row items-center">
      <span className="label mr-1">{label}</span>
      {children}
    </div>
  );
}

function Chip({ href, on, children }: { href: string; on: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} aria-current={on ? "true" : undefined} className={`chip ${on ? "chip-on" : ""}`}>
      {children}
    </Link>
  );
}

function ExploreSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="seg">
          {TABS.map((t) => (
            <span key={t.id} className="seg-item text-faint">
              {t.label}
            </span>
          ))}
        </div>
        <Skeleton className="h-[30px] w-[30rem] max-w-full rounded-full" />
      </div>
      <CardGridSkeleton />
    </div>
  );
}
