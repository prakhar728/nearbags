// Explore (spec §5.1): tabs Trending / Top performers / Most held / New, filters by kind and max fee.
// Tabs and filters live in searchParams so every view is a link.
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { BasketCard } from "@/components/basket/BasketCard";
import { CardGridSkeleton } from "@/components/basket/Skeletons";
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
      <div className="space-y-3">
        <h1 className="font-mono text-2xl font-semibold tracking-tight sm:text-3xl">Bag it. Any chain. Your keys.</h1>
        <p className="max-w-xl text-sm leading-relaxed text-muted">
          Creator-made baskets of tokenized US stocks and crypto. Buy the whole bag in one go. Every position sits in its own NEAR Intents account that only you control.
        </p>
      </div>
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
      <div className="flex flex-col gap-4 border-b border-border pb-4 lg:flex-row lg:items-end lg:justify-between">
        <nav className="-mb-px flex gap-5 overflow-x-auto" aria-label="Explore tabs">
          {TABS.map((t) => (
            <Link
              key={t.id}
              href={href(q, { tab: t.id })}
              aria-current={q.tab === t.id ? "page" : undefined}
              className={`whitespace-nowrap font-mono text-xs uppercase tracking-wider ${q.tab === t.id ? "text-accent" : "text-muted hover:text-text"}`}
            >
              {t.label}
            </Link>
          ))}
        </nav>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
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

      {note && <p className="font-mono text-[11px] text-faint">{note}</p>}

      {cards.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {cards.map((c) => (
            <BasketCard key={c.basket.id} {...c} />
          ))}
        </div>
      ) : (
        <Empty q={q} total={filtered.length} />
      )}

      <p className="font-mono text-[10px] leading-relaxed text-faint">
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
    <div className="border border-dashed border-border p-8 text-center">
      <p className="text-sm text-muted">{msg}</p>
      <div className="mt-4 flex justify-center gap-4 font-mono text-xs">
        <Link href="/explore?tab=new" className="text-text underline decoration-border-strong underline-offset-4 hover:decoration-accent">
          See newest
        </Link>
        <Link href="/create" className="text-text underline decoration-border-strong underline-offset-4 hover:decoration-accent">
          Make one
        </Link>
      </div>
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-[10px] uppercase tracking-wider text-faint">{label}</span>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  );
}

function Chip({ href, on, children }: { href: string; on: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} className={`num border px-2 py-0.5 text-[11px] ${on ? "border-accent text-accent" : "border-border text-muted hover:border-border-strong hover:text-text"}`}>
      {children}
    </Link>
  );
}

function ExploreSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-border pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex gap-5 overflow-hidden">
          {TABS.map((t) => (
            <span key={t.id} className="whitespace-nowrap font-mono text-xs uppercase tracking-wider text-faint">
              {t.label}
            </span>
          ))}
        </div>
        <Skeleton className="h-[22px] w-[30rem] max-w-full" />
      </div>
      <CardGridSkeleton />
    </div>
  );
}
