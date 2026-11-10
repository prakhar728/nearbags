// Live reference prices (spec §7.1, §7.4), cached 60 s per asset.
//
// Crypto: median of Binance, Coinbase and Kraken tickers.
// Ondo stocks/ETFs: two independent views of what one TOKEN should cost.
//   - "indicative": 1Click's token price (already includes Ondo's shares-per-token multiplier)
//   - "underlying": live share price (Nasdaq incl. pre/after-hours, Yahoo 1m bars) × our dividend-derived multiplier
// The guard uses the indicative price and reports when the two views disagree by more than 3%.
// Meme coins (Rhea): median of the DCL pool's mid × NEAR/USD (on-chain), DexScreener and GeckoTerminal for that pool.
import "server-only";
import { and, eq, gte } from "drizzle-orm";
import { db, schema } from "@/db";
import { getAsset, type Asset } from "@/lib/assets";
import { memeMid } from "@/lib/rhea";
import { median } from "./median";
import { consensusDividends, WITHHOLDING } from "./total-return";

export const ONDO_LAUNCH = "2025-09-03";
const TTL_MS = 60_000;
const UA = "Mozilla/5.0";

export interface LivePrice {
  assetId: string;
  price: number; // USD per token (the unit we buy)
  sources: Record<string, number>;
  underlyingPerShare?: number; // stocks: live share price
  multiplier?: number; // stocks: estimated shares per token
  disagreement?: number; // stocks: |indicative / (underlying × multiplier) − 1|
  at: number;
}

const cache = new Map<string, LivePrice>();

async function j<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
  const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json", ...headers }, signal: AbortSignal.timeout(10_000), cache: "no-store" });
  if (!r.ok) throw new Error(`${r.status} ${url.split("?")[0]}`);
  return (await r.json()) as T;
}

const KRAKEN: Record<string, string> = { BTC: "XBTUSD", DOGE: "XDGUSD" };

async function cryptoQuotes(sym: string): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  await Promise.allSettled([
    j<{ price: string }>(`https://data-api.binance.vision/api/v3/ticker/price?symbol=${sym}USDT`).then((r) => (out.binance = Number(r.price))),
    j<{ price: string }>(`https://api.exchange.coinbase.com/products/${sym}-USD/ticker`).then((r) => (out.coinbase = Number(r.price))),
    j<{ result: Record<string, { c: [string] }> }>(`https://api.kraken.com/0/public/Ticker?pair=${KRAKEN[sym] ?? sym + "USD"}`).then((r) => {
      const v = Object.values(r.result ?? {})[0];
      if (v) out.kraken = Number(v.c[0]);
    }),
  ]);
  for (const k of Object.keys(out)) if (!(out[k] > 0)) delete out[k];
  return out;
}

async function shareQuotes(a: Asset): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  const cls = a.kind === "etf" ? "etf" : "stocks";
  await Promise.allSettled([
    j<{ data: { primaryData: { lastSalePrice: string } } }>(`https://api.nasdaq.com/api/quote/${a.refTicker}/info?assetclass=${cls}`).then(
      (r) => (out.nasdaq = Number(r.data.primaryData.lastSalePrice.replace(/[$,]/g, ""))),
    ),
    j<{ chart: { result: { indicators: { quote: { close: (number | null)[] }[] } }[] } }>(
      `https://query1.finance.yahoo.com/v8/finance/chart/${a.refTicker}?range=1d&interval=1m&includePrePost=true`,
    ).then((r) => {
      const closes = r.chart.result[0].indicators.quote[0].close.filter((x): x is number => x != null);
      if (closes.length) out.yahoo = closes[closes.length - 1];
    }),
  ]);
  for (const k of Object.keys(out)) if (!(out[k] > 0)) delete out[k];
  return out;
}

/** Shares per token implied by dividends since Ondo's launch (reinvested net of withholding). */
export async function estimatedMultiplier(ticker: string): Promise<number> {
  const rows = await db().select().from(schema.dividends).where(and(eq(schema.dividends.ticker, ticker), gte(schema.dividends.exDate, ONDO_LAUNCH)));
  if (!rows.length) return 1;
  const bySrc = new Map<string, { date: string; amount: number }[]>();
  for (const r of rows) (bySrc.get(r.source) ?? bySrc.set(r.source, []).get(r.source)!).push({ date: r.exDate, amount: r.amount });
  const closes = await db()
    .select({ date: schema.priceMedian.date, close: schema.priceMedian.close })
    .from(schema.priceMedian)
    .where(and(eq(schema.priceMedian.ticker, ticker), gte(schema.priceMedian.date, "2025-08-01")));
  closes.sort((x, y) => x.date.localeCompare(y.date));
  let m = 1;
  for (const d of consensusDividends([...bySrc.values()])) {
    let prev: number | undefined;
    for (const c of closes) if (c.date < d.date) prev = c.close;
    if (prev) m *= 1 + ((1 - WITHHOLDING) * d.amount) / prev;
  }
  return m;
}

async function memeQuotes(a: Asset): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  const pool = a.rhea!.geckoPool;
  await Promise.allSettled([
    livePrice("NEAR").then(async (n) => (out.dcl_mid = await memeMid(a, n.price))),
    j<{ pairs?: { pairAddress: string; priceUsd?: string }[] }>(`https://api.dexscreener.com/latest/dex/tokens/${a.rhea!.token}`).then((r) => {
      const p = r.pairs?.find((x) => x.pairAddress === pool);
      if (p?.priceUsd) out.dexscreener = Number(p.priceUsd);
    }),
    j<{ data?: { attributes?: { base_token_price_usd?: string } } }>(`https://api.geckoterminal.com/api/v2/networks/near/pools/${encodeURIComponent(pool)}`).then((r) => {
      const v = r.data?.attributes?.base_token_price_usd;
      if (v) out.geckoterminal = Number(v);
    }),
  ]);
  for (const k of Object.keys(out)) if (!(out[k] > 0) || !Number.isFinite(out[k])) delete out[k];
  return out;
}

let tokenPriceCache: { at: number; prices: Map<string, number> } | null = null;
async function oneClickIndicative(): Promise<Map<string, number>> {
  if (tokenPriceCache && Date.now() - tokenPriceCache.at < TTL_MS) return tokenPriceCache.prices;
  const toks = await j<{ assetId: string; price: number }[]>("https://1click.chaindefuser.com/v0/tokens?ondoTokens=1");
  tokenPriceCache = { at: Date.now(), prices: new Map(toks.map((t) => [t.assetId, t.price])) };
  return tokenPriceCache.prices;
}

export async function livePrice(assetId: string): Promise<LivePrice> {
  const hit = cache.get(assetId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit;
  const a = getAsset(assetId);
  let lp: LivePrice;

  if (a.kind === "stable") {
    lp = { assetId, price: 1, sources: { fixed: 1 }, at: Date.now() };
  } else if (a.kind === "meme") {
    const sources = await memeQuotes(a);
    const vals = Object.values(sources);
    if (!vals.length) throw new Error(`No live price for ${assetId}`);
    // The on-chain mid is what swaps trade against; the indexers lag it. With only two sources, prefer the chain.
    lp = { assetId, price: vals.length === 2 && sources.dcl_mid ? sources.dcl_mid : median(vals), sources, at: Date.now() };
  } else if (a.kind === "crypto") {
    const sources = await cryptoQuotes(a.refTicker);
    const vals = Object.values(sources);
    if (!vals.length) throw new Error(`No live price for ${assetId}`);
    lp = { assetId, price: median(vals), sources, at: Date.now() };
  } else {
    const [shares, indicative, multiplier] = await Promise.all([shareQuotes(a), oneClickIndicative(), estimatedMultiplier(a.refTicker)]);
    const shareVals = Object.values(shares);
    const underlyingPerShare = shareVals.length ? median(shareVals) : undefined;
    const fromUnderlying = underlyingPerShare ? underlyingPerShare * multiplier : undefined;
    const ind = indicative.get(a.intentsAssetId);
    const price = ind ?? fromUnderlying;
    if (!price) throw new Error(`No live price for ${assetId}`);
    lp = {
      assetId,
      price,
      sources: { ...(ind ? { oneclick: ind } : {}), ...(fromUnderlying ? { underlying_x_multiplier: fromUnderlying } : {}), ...shares },
      underlyingPerShare,
      multiplier,
      disagreement: ind && fromUnderlying ? Math.abs(ind / fromUnderlying - 1) : undefined,
      at: Date.now(),
    };
  }
  cache.set(assetId, lp);
  return lp;
}
