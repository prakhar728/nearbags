// Price ingestion and reads (spec §7.1). Raw closes per source go to price_daily; the combined reference goes to price_median.
import { and, asc, eq, gte, inArray, max, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { ASSETS, getAsset, type Asset } from "@/lib/assets";
import { combine } from "./median";
import { fetchSource, nasdaqDividends, sourcesFor, twelvedataDividends, yahooDividends, type Bar, type Dividend, type SourceName } from "./sources";
import { consensusDividends, totalReturn } from "./total-return";

const HISTORY_YEARS = 5;
const TOP_UP_OVERLAP_DAYS = 7;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export interface IngestResult {
  ticker: string;
  from: string;
  sources: Partial<Record<SourceName | "dividends", number | string>>; // bar count, or error text
  medianDays: number;
  flaggedDays: number;
}

async function lastStoredDate(ticker: string): Promise<string | null> {
  const [row] = await db()
    .select({ d: max(schema.priceMedian.date) })
    .from(schema.priceMedian)
    .where(eq(schema.priceMedian.ticker, ticker));
  return row?.d ?? null;
}

export async function ingestAsset(asset: Asset, opts: { full?: boolean } = {}): Promise<IngestResult> {
  const ticker = asset.refTicker;
  const last = opts.full ? null : await lastStoredDate(ticker);
  const from = last
    ? iso(Date.parse(last) - TOP_UP_OVERLAP_DAYS * 86_400_000)
    : iso(Date.now() - (HISTORY_YEARS * 365 + 10) * 86_400_000);

  const sources = sourcesFor(asset);
  const fetched: Partial<Record<SourceName, Bar[]>> = {};
  const report: IngestResult["sources"] = {};
  await Promise.all(
    sources.map(async (s) => {
      // CoinGecko is a fallback: only used when fewer than 2 primary crypto sources answer.
      if (s === "coingecko") return;
      try {
        fetched[s] = await fetchSource(s, asset, from);
        report[s] = fetched[s]!.length;
      } catch (e) {
        report[s] = (e as Error).message.slice(0, 120);
      }
    }),
  );
  if (sources.includes("coingecko") && Object.values(fetched).filter((b) => b && b.length).length < 2) {
    try {
      fetched.coingecko = (await fetchSource("coingecko", asset, from)).filter((b) => b.date >= from);
      report.coingecko = fetched.coingecko.length;
    } catch (e) {
      report.coingecko = (e as Error).message.slice(0, 120);
    }
  }

  const rows = Object.entries(fetched).flatMap(([source, bars]) =>
    (bars ?? []).filter((b) => b.date >= from).map((b) => ({ source, ticker, date: b.date, close: b.close })),
  );
  for (let i = 0; i < rows.length; i += 1000) {
    await db()
      .insert(schema.priceDaily)
      .values(rows.slice(i, i + 1000))
      .onConflictDoUpdate({
        target: [schema.priceDaily.source, schema.priceDaily.ticker, schema.priceDaily.date],
        set: { close: sql`excluded.close` },
      });
  }

  // Recompute medians from everything stored for the affected dates (so late sources still count).
  const stored = await db()
    .select()
    .from(schema.priceDaily)
    .where(and(eq(schema.priceDaily.ticker, ticker), gte(schema.priceDaily.date, from)));
  const bySource: Partial<Record<SourceName, Bar[]>> = {};
  for (const r of stored) (bySource[r.source as SourceName] ??= []).push({ date: r.date, close: r.close });
  const med = combine(bySource, sources);

  for (let i = 0; i < med.length; i += 1000) {
    await db()
      .insert(schema.priceMedian)
      .values(med.slice(i, i + 1000).map((m) => ({ ticker, date: m.date, close: m.close, sourcesUsed: m.sourcesUsed, flagged: m.flagged })))
      .onConflictDoUpdate({
        target: [schema.priceMedian.ticker, schema.priceMedian.date],
        set: { close: sql`excluded.close`, sourcesUsed: sql`excluded.sources_used`, flagged: sql`excluded.flagged` },
      });
  }

  if (asset.kind === "stock" || asset.kind === "etf") {
    report.dividends = await ingestDividends(asset, from);
  }

  return { ticker, from, sources: report, medianDays: med.length, flaggedDays: med.filter((m) => m.flagged.length).length };
}

async function ingestDividends(asset: Asset, from: string): Promise<string> {
  const ticker = asset.refTicker;
  const cls = asset.kind === "etf" ? "etf" : "stocks";
  const results = await Promise.allSettled([
    yahooDividends(ticker, from).then((d) => ["yahoo", d] as const),
    nasdaqDividends(ticker, from, cls).then((d) => ["nasdaq", d] as const),
    twelvedataDividends(ticker, from).then((d) => ["twelvedata", d] as const),
  ]);
  const parts: string[] = [];
  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    const [source, divs] = r.value;
    parts.push(`${source}:${divs.length}`);
    if (!divs.length) continue;
    await db()
      .insert(schema.dividends)
      .values(divs.map((d) => ({ source, ticker, exDate: d.date, amount: d.amount })))
      .onConflictDoUpdate({
        target: [schema.dividends.source, schema.dividends.ticker, schema.dividends.exDate],
        set: { amount: sql`excluded.amount` },
      });
  }
  return parts.join("/") || "none";
}

export async function ingestAll(opts: { full?: boolean; ids?: string[] } = {}): Promise<IngestResult[]> {
  const list = (opts.ids?.map(getAsset) ?? ASSETS).filter((a) => a.kind !== "stable");
  const out: IngestResult[] = [];
  // Sequential per asset to stay polite with free APIs.
  for (const a of list) out.push(await ingestAsset(a, opts));
  return out;
}

export type Series = Map<string, Map<string, number>>; // ticker -> date -> close

const KIND_BY_TICKER = new Map(ASSETS.map((a) => [a.refTicker, a.kind]));

/**
 * Reference closes for tickers from a date onwards. USDC is a constant 1.
 * Stocks/ETFs are total return by default (dividends reinvested net of 30% withholding), matching Ondo tokens.
 */
export async function loadSeries(tickers: string[], from = "1900-01-01", opts: { totalReturn?: boolean } = {}): Promise<Series> {
  const out = await loadPriceOnly(tickers, from);
  if (opts.totalReturn === false) return out;
  const equities = tickers.filter((t) => KIND_BY_TICKER.get(t) === "stock" || KIND_BY_TICKER.get(t) === "etf");
  if (!equities.length) return out;
  const rows = await db().select().from(schema.dividends).where(inArray(schema.dividends.ticker, equities));
  for (const t of equities) {
    const closes = out.get(t);
    if (!closes) continue;
    const bySource = new Map<string, Dividend[]>();
    for (const r of rows) if (r.ticker === t) (bySource.get(r.source) ?? bySource.set(r.source, []).get(r.source)!).push({ date: r.exDate, amount: r.amount });
    out.set(t, totalReturn(closes, consensusDividends([...bySource.values()])));
  }
  return out;
}

async function loadPriceOnly(tickers: string[], from: string): Promise<Series> {
  const out: Series = new Map();
  const real = tickers.filter((t) => t !== "USDC");
  if (real.length) {
    const rows = await db()
      .select({ ticker: schema.priceMedian.ticker, date: schema.priceMedian.date, close: schema.priceMedian.close })
      .from(schema.priceMedian)
      .where(and(inArray(schema.priceMedian.ticker, real), gte(schema.priceMedian.date, from)))
      .orderBy(asc(schema.priceMedian.date));
    for (const r of rows) {
      let m = out.get(r.ticker);
      if (!m) out.set(r.ticker, (m = new Map()));
      m.set(r.date, r.close);
    }
  }
  if (tickers.includes("USDC")) out.set("USDC", new Map()); // engine treats USDC as constant 1
  return out;
}
