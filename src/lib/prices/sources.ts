// Daily close fetchers. Every source returns split-adjusted (not dividend-adjusted) closes keyed by date,
// so medians compare like with like. Dates: stocks = US exchange date; crypto = UTC day of the candle.
import type { Asset } from "@/lib/assets";

export interface Bar {
  date: string; // YYYY-MM-DD
  close: number;
}
export type SourceName = "yahoo" | "nasdaq" | "twelvedata" | "binance" | "coinbase" | "kraken" | "coingecko" | "geckoterminal";

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const DAY = 86_400_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Retries 429 and 5xx with backoff. `urls` lets a source fall back to a mirror host.
async function getJson<T>(urls: string | string[], init: RequestInit = {}, timeoutMs = 20_000): Promise<T> {
  const list = Array.isArray(urls) ? urls : [urls];
  let last = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    const url = list[attempt % list.length];
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
      if (res.ok) return (await res.json()) as T;
      last = `${res.status} ${res.statusText} for ${url.split("?")[0]}`;
      if (res.status !== 429 && res.status < 500) break;
    } catch (e) {
      last = `${(e as Error).message} for ${url.split("?")[0]}`;
    }
    await sleep(1000 * 2 ** attempt);
  }
  throw new Error(last);
}

const utcDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const nyDate = (ms: number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(ms),
  );
const valid = (b: Bar) => Number.isFinite(b.close) && b.close > 0;
const dedupe = (bars: Bar[]) => [...new Map(bars.filter(valid).map((b) => [b.date, b])).values()].sort((a, b) => a.date.localeCompare(b.date));

// ---------- Stocks / ETFs ----------

export async function yahoo(ticker: string, from: string): Promise<Bar[]> {
  const p1 = Math.floor(Date.parse(from) / 1000);
  const p2 = Math.floor(Date.now() / 1000);
  type R = { chart: { result: { timestamp?: number[]; indicators: { quote: { close: (number | null)[] }[] } }[] | null } };
  const path = `/v8/finance/chart/${encodeURIComponent(ticker)}?period1=${p1}&period2=${p2}&interval=1d&events=split`;
  const r = await getJson<R>([`https://query1.finance.yahoo.com${path}`, `https://query2.finance.yahoo.com${path}`], {
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  const res = r.chart.result?.[0];
  if (!res?.timestamp) return [];
  const closes = res.indicators.quote[0].close;
  return dedupe(res.timestamp.map((t, i) => ({ date: nyDate(t * 1000), close: closes[i] ?? NaN })));
}

export async function nasdaq(ticker: string, from: string, assetClass: "stocks" | "etf"): Promise<Bar[]> {
  const to = utcDate(Date.now());
  type R = { data: { tradesTable: { rows: { date: string; close: string }[] } } | null };
  const r = await getJson<R>(
    `https://api.nasdaq.com/api/quote/${encodeURIComponent(ticker)}/historical?assetclass=${assetClass}&fromdate=${from}&todate=${to}&limit=9999`,
    { headers: { "User-Agent": BROWSER_UA, Accept: "application/json, text/plain, */*" } },
  );
  const rows = r.data?.tradesTable?.rows ?? [];
  return dedupe(
    rows.map((row) => {
      const [m, d, y] = row.date.split("/");
      return { date: `${y}-${m}-${d}`, close: Number(row.close.replace(/[$,]/g, "")) };
    }),
  );
}

export async function twelvedata(ticker: string, from: string): Promise<Bar[]> {
  const key = process.env.TWELVEDATA_API_KEY;
  if (!key) throw new Error("TWELVEDATA_API_KEY not set");
  type R = { status?: string; message?: string; values?: { datetime: string; close: string }[] };
  const r = await getJson<R>(
    `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(ticker)}&interval=1day&start_date=${from}&outputsize=5000&order=ASC&apikey=${key}`,
  );
  if (r.status === "error") throw new Error(`twelvedata: ${r.message}`);
  return dedupe((r.values ?? []).map((v) => ({ date: v.datetime.slice(0, 10), close: Number(v.close) })));
}

// ---------- Dividends (Ondo tokens are total return: dividends reinvested net of 30% US withholding) ----------

export interface Dividend {
  date: string; // ex-date
  amount: number; // per share, split-adjusted
}
const pastOnly = (d: Dividend[]) => {
  const today = utcDate(Date.now());
  return d.filter((x) => x.date <= today && Number.isFinite(x.amount) && x.amount > 0);
};

export async function yahooDividends(ticker: string, from: string): Promise<Dividend[]> {
  const p1 = Math.floor(Date.parse(from) / 1000);
  const p2 = Math.floor(Date.now() / 1000);
  type R = { chart: { result: { events?: { dividends?: Record<string, { amount: number; date: number }> } }[] | null } };
  const path = `/v8/finance/chart/${encodeURIComponent(ticker)}?period1=${p1}&period2=${p2}&interval=1d&events=div`;
  const r = await getJson<R>([`https://query1.finance.yahoo.com${path}`, `https://query2.finance.yahoo.com${path}`], {
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  const ev = r.chart.result?.[0]?.events?.dividends ?? {};
  return pastOnly(Object.values(ev).map((v) => ({ date: nyDate(v.date * 1000), amount: v.amount })));
}

/** Nasdaq only serves dividend history for Nasdaq-listed tickers; others return no rows. */
export async function nasdaqDividends(ticker: string, from: string, assetClass: "stocks" | "etf"): Promise<Dividend[]> {
  type R = { data: { dividends?: { rows: { exOrEffDate: string; amount: string; type: string }[] | null } } | null };
  const r = await getJson<R>(`https://api.nasdaq.com/api/quote/${encodeURIComponent(ticker)}/dividends?assetclass=${assetClass}`, {
    headers: { "User-Agent": BROWSER_UA, Accept: "application/json, text/plain, */*" },
  });
  const rows = r.data?.dividends?.rows ?? [];
  return pastOnly(
    rows
      .filter((x) => x.type === "Cash" && x.exOrEffDate !== "N/A")
      .map((x) => {
        const [m, d, y] = x.exOrEffDate.split("/");
        return { date: `${y}-${m}-${d}`, amount: Number(x.amount.replace(/[$,]/g, "")) };
      })
      .filter((x) => x.date >= from),
  );
}

export async function twelvedataDividends(ticker: string, from: string): Promise<Dividend[]> {
  const key = process.env.TWELVEDATA_API_KEY;
  if (!key) throw new Error("TWELVEDATA_API_KEY not set");
  type R = { status?: string; message?: string; dividends?: { ex_date: string; amount: number }[] };
  const r = await getJson<R>(`https://api.twelvedata.com/dividends?symbol=${encodeURIComponent(ticker)}&start_date=${from}&apikey=${key}`);
  if (r.status === "error") throw new Error(`twelvedata: ${r.message}`);
  return pastOnly((r.dividends ?? []).map((x) => ({ date: x.ex_date, amount: Number(x.amount) })));
}

// ---------- Crypto ----------

const KRAKEN_PAIR: Record<string, string> = { BTC: "XBTUSD", DOGE: "XDGUSD" };
const COINGECKO_ID: Record<string, string> = {
  BTC: "bitcoin", ETH: "ethereum", SOL: "solana", NEAR: "near", ZEC: "zcash", XRP: "ripple", DOGE: "dogecoin", SUI: "sui", BNB: "binancecoin",
};

export async function binance(sym: string, from: string): Promise<Bar[]> {
  // data-api.binance.vision is Binance's public market-data mirror (api.binance.com blocks US-hosted servers).
  const out: Bar[] = [];
  let start = Date.parse(from);
  for (let i = 0; i < 10 && start < Date.now(); i++) {
    const rows = await getJson<[number, string, string, string, string][]>(
      `https://data-api.binance.vision/api/v3/klines?symbol=${sym}USDT&interval=1d&startTime=${start}&limit=1000`,
    );
    if (!rows.length) break;
    // Skip today's still-open candle.
    for (const k of rows) if (k[0] + DAY <= Date.now()) out.push({ date: utcDate(k[0]), close: Number(k[4]) });
    start = rows[rows.length - 1][0] + DAY;
  }
  return dedupe(out);
}

export async function coinbase(sym: string, from: string): Promise<Bar[]> {
  const out: Bar[] = [];
  let start = Date.parse(from);
  const now = Date.now();
  for (let i = 0; i < 12 && start < now; i++) {
    const end = Math.min(start + 299 * DAY, now);
    const rows = await getJson<[number, number, number, number, number, number][]>(
      `https://api.exchange.coinbase.com/products/${sym}-USD/candles?granularity=86400&start=${new Date(start).toISOString()}&end=${new Date(end).toISOString()}`,
      { headers: { "User-Agent": BROWSER_UA } },
    );
    for (const c of rows) if (c[0] * 1000 + DAY <= now) out.push({ date: utcDate(c[0] * 1000), close: c[4] });
    start = end + DAY;
  }
  return dedupe(out);
}

export async function kraken(sym: string, from: string): Promise<Bar[]> {
  // Kraken returns at most the last 720 daily candles; older dates come from the other sources.
  const pair = KRAKEN_PAIR[sym] ?? `${sym}USD`;
  type R = { error: string[]; result: Record<string, [number, string, string, string, string][] | number> };
  const r = await getJson<R>(`https://api.kraken.com/0/public/OHLC?pair=${pair}&interval=1440&since=${Math.floor(Date.parse(from) / 1000)}`);
  if (r.error?.length) throw new Error(`kraken: ${r.error.join(", ")}`);
  const key = Object.keys(r.result).find((k) => k !== "last");
  const rows = (key ? r.result[key] : []) as [number, string, string, string, string][];
  return dedupe(rows.filter((c) => c[0] * 1000 + DAY <= Date.now()).map((c) => ({ date: utcDate(c[0] * 1000), close: Number(c[4]) })));
}

export async function coingecko(sym: string): Promise<Bar[]> {
  // Fallback only: the free API serves the last 365 days of daily prices.
  const id = COINGECKO_ID[sym];
  if (!id) return [];
  const r = await getJson<{ prices: [number, number][] }>(
    `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=365&interval=daily`,
  );
  // CoinGecko stamps each daily price at 00:00 UTC of the *next* day; shift back to match candle closes.
  // The final point is the live price (not a midnight stamp), so keep only midnight points.
  return dedupe(r.prices.filter(([t]) => t % DAY === 0).map(([t, p]) => ({ date: utcDate(t - DAY), close: p })));
}

// ---------- Meme coins (Rhea DCL pools) ----------

/**
 * GeckoTerminal daily candles for a pool, in USD per base token. The pool's history starts at its launch (HOOT
 * 2026-09-30, NEARLY 2026-09-22), so a meme coin has weeks of history, not years. Today's open candle is skipped.
 */
export async function geckoterminal(poolAddress: string, from: string): Promise<Bar[]> {
  type R = { data?: { attributes?: { ohlcv_list?: [number, number, number, number, number, number][] } } };
  const r = await getJson<R>(
    `https://api.geckoterminal.com/api/v2/networks/near/pools/${encodeURIComponent(poolAddress)}/ohlcv/day?limit=1000&currency=usd&token=base`,
    { headers: { Accept: "application/json", "User-Agent": BROWSER_UA } },
  );
  const rows = r.data?.attributes?.ohlcv_list ?? [];
  return dedupe(rows.filter((c) => c[0] * 1000 + DAY <= Date.now()).map((c) => ({ date: utcDate(c[0] * 1000), close: c[4] }))).filter((b) => b.date >= from);
}

// ---------- Routing ----------

export function sourcesFor(asset: Asset): SourceName[] {
  if (asset.kind === "stock" || asset.kind === "etf") return ["yahoo", "nasdaq", "twelvedata"];
  if (asset.kind === "crypto") return ["binance", "coinbase", "kraken", "coingecko"];
  if (asset.kind === "meme" && asset.rhea) return ["geckoterminal"];
  return [];
}

export async function fetchSource(source: SourceName, asset: Asset, from: string): Promise<Bar[]> {
  const t = asset.refTicker;
  switch (source) {
    case "yahoo":
      return yahoo(t, from);
    case "nasdaq":
      return nasdaq(t, from, asset.kind === "etf" ? "etf" : "stocks");
    case "twelvedata":
      return twelvedata(t, from);
    case "binance":
      return binance(t, from);
    case "coinbase":
      return coinbase(t, from);
    case "kraken":
      return kraken(t, from);
    case "coingecko":
      return coingecko(t);
    case "geckoterminal":
      if (!asset.rhea) throw new Error(`${asset.id} has no pool for GeckoTerminal`);
      return geckoterminal(asset.rhea.geckoPool, from);
  }
}
