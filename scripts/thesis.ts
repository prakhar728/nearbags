// Usage: pnpm thesis [--weeks 26] [--total-weeks 8] [--max-requests 720] [--render-only]
//
// Rebuilds the thesis track from raw NEAR Intents Explorer data:
//   1. pulls 1Click swaps that touch an Ondo stock/ETF token, one UTC week at a time, plus the unfiltered 1Click feed for
//      the last few complete weeks (for the share-of-volume chart);
//   2. caches every page under data/thesis/raw/ (gitignored) so reruns only fetch what is new;
//   3. aggregates (src/lib/thesis/aggregate.ts) into data/thesis/thesis.json (checked in);
//   4. renders THESIS.template.md into THESIS.md.
// --render-only skips 1–3 and re-renders THESIS.md from the existing thesis.json.
//
// ── Explorer API, as confirmed on 2026-11-09 ──────────────────────────────────────────────────────────────────────────
// Sources: https://docs.near-intents.org/integration/distribution-channels/1click-api/explorer/introduction
//          https://explorer.near-intents.org/api/v0/openapi.yaml (OpenAPI 3.0, "Intents Explorer API" v0.0.0)
// Base URL   https://explorer.near-intents.org/api/v0
// Auth       Authorization: Bearer <JWT>, required on every call. Token from https://partners.near-intents.org.
//            Without it the API answers HTTP 400 {"code":"Bad Request","error":{"code":"MISSING_TOKEN",...}} (probed).
// Rate limit 1 request / 5 s per partner id (taken from the JWT); over the limit → 429 with a {status,error} body.
// Endpoint   GET /transactions  → JSON array of transactions (no envelope, no total count).
//   numberOfTransactions 1–1000 (default 50)
//   direction            next = older (default), prev = newer
//   lastDepositAddress + lastDepositMemo   cursor: the last row of the previous page (lastDepositAddressAndMemo is
//                                          deprecated). Docs: repeat until an empty array comes back.
//   statuses             comma list of FAILED, INCOMPLETE_DEPOSIT, PENDING_DEPOSIT, PROCESSING, REFUNDED, SUCCESS
//                        (default FAILED,PROCESSING,REFUNDED,SUCCESS)
//   fromTokenId / toTokenId   repeatable, OR-matched; override fromChainId / toChainId. Also fromChainId/toChainId.
//   startTimestampUnix / endTimestampUnix   both "non-inclusive" (ISO variants startTimestamp / endTimestamp exist)
//   minUsdPrice / maxUsdPrice, referral, affiliate, search, depositMemo, showTestTxs
//   Note: every swap-specific filter (token, chain, referral, affiliate, min/max USD) "excludes masking transactions".
// Row fields used here: originAsset, destinationAsset, depositAddress, depositMemo, status, createdAtTimestamp (Unix s),
//   amountInUsd / amountOutUsd (strings), refundTo, senders[], recipient.
//   Other fields: createdAt, amountIn(Formatted), amountOut(Formatted), appFees[], referral, intentHashes, nearTxHashes,
//   originChainTxHashes, destinationChainTxHashes, refundReason, refundFee(Formatted), depositType, recipientType,
//   refundType, depositAddressAndMemo.
// NOT confirmed (no token yet, so nothing was fetched with auth):
//   - whether an explorer-type JWT sees all 1Click swaps or only the partner's own (docs say the API "mirrors the data
//     available on the NEAR Intents Explorer", which is global);
//   - that the cursor combines with timestamp and token filters as expected;
//   - what "masking transactions" are; minUsdPrice=0 on the unfiltered pull is our way to drop them so the total matches
//     the token-filtered pulls. Check the first real run against https://explorer.near-intents.org.
//   - the docs search snippet mentions GET /transactions-pages?page=N; it is not in the current OpenAPI file, so unused.
// ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { aggregate, weekSec, weekTotals, weeksBetween } from "../src/lib/thesis/aggregate";
import { MIN_GAP_MS, ONDO_IDS, ONDO_SYMBOL, PAGE_SIZE, streamParams, transactionsUrl, EXPLORER_BASE, type Cursor, type StreamKind } from "../src/lib/thesis/explorer";
import { placeholderValues, renderTemplate } from "../src/lib/thesis/render";
import type { ExplorerTx, StonkbagTvl, ThesisData, WeekTotals } from "../src/lib/thesis/types";

const ROOT = path.resolve(import.meta.dirname, "..");
const RAW = path.join(ROOT, "data/thesis/raw");
const OUT = path.join(ROOT, "data/thesis/thesis.json");
const TEMPLATE = path.join(ROOT, "THESIS.template.md");
const THESIS_MD = path.join(ROOT, "THESIS.md");
const DAY = 86_400;
const SETTLE = 2 * DAY; // a week is final once it ended 2 days ago (late PROCESSING → SUCCESS)

function flag(name: string, dflt: number): number {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return dflt;
  const n = Number(process.argv[i + 1]);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`--${name} needs a positive integer`);
  return n;
}

// ── HTTP: one request at a time, ≥ 5 s apart, backoff on 429 / 5xx ──────────────────────────────────────────────────
let lastCall = 0;
let requests = 0;
let budget = Infinity;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class BudgetExhausted extends Error {}

async function getPage(url: string, jwt: string): Promise<ExplorerTx[]> {
  for (let attempt = 0; attempt < 7; attempt++) {
    if (requests >= budget) throw new BudgetExhausted();
    const wait = lastCall + MIN_GAP_MS + 250 - Date.now();
    if (wait > 0) await sleep(wait);
    lastCall = Date.now();
    requests++;
    let res: Response;
    try {
      res = await fetch(url, { headers: { Authorization: `Bearer ${jwt}`, Accept: "application/json" }, signal: AbortSignal.timeout(60_000) });
    } catch (e) {
      const ms = 10_000 * 2 ** attempt;
      console.warn(`  network error (${(e as Error).message}); retrying in ${ms / 1000}s`);
      await sleep(ms);
      continue;
    }
    if (res.status === 429 || res.status >= 500) {
      const ra = Number(res.headers.get("retry-after"));
      const ms = Number.isFinite(ra) && ra > 0 ? ra * 1000 : 10_000 * 2 ** attempt;
      console.warn(`  HTTP ${res.status}; retrying in ${Math.round(ms / 1000)}s`);
      await sleep(ms);
      continue;
    }
    const body = await res.text();
    if (!res.ok) throw new Error(`Explorer API HTTP ${res.status}: ${body.slice(0, 300)}`);
    const json = JSON.parse(body) as unknown;
    if (!Array.isArray(json)) throw new Error(`Explorer API: expected an array, got ${body.slice(0, 200)}`);
    return json as ExplorerTx[];
  }
  throw new Error("Explorer API: gave up after 7 attempts");
}

// ── Raw cache: data/thesis/raw/<kind>/<week>/page-0001.json + state.json ───────────────────────────────────────────────
interface PageFile {
  request: string; // URL without the token
  fetchedAt: string;
  rows: ExplorerTx[];
}
interface StreamState {
  complete: boolean;
  settled: boolean;
  pages: number;
}

const slim = (t: ExplorerTx): ExplorerTx => ({
  originAsset: t.originAsset,
  destinationAsset: t.destinationAsset,
  depositAddress: t.depositAddress,
  depositMemo: t.depositMemo,
  recipient: t.recipient,
  status: t.status,
  createdAt: t.createdAt,
  createdAtTimestamp: t.createdAtTimestamp,
  amountInUsd: t.amountInUsd,
  amountOutUsd: t.amountOutUsd,
});

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch {
    return null;
  }
}

async function loadPages(dir: string): Promise<PageFile[]> {
  const names = (await readdir(dir).catch(() => [] as string[])).filter((n) => n.startsWith("page-")).sort();
  const out: PageFile[] = [];
  for (const n of names) {
    const p = await readJson<PageFile>(path.join(dir, n));
    if (p) out.push(p);
  }
  return out;
}

/** Pulls one stream for one week, resuming from cache. Returns every row and whether the pull reached the end. */
async function pullWeek(kind: StreamKind, week: string, now: number, jwt: string): Promise<{ rows: ExplorerTx[]; complete: boolean }> {
  const dir = path.join(RAW, kind, week);
  const start = weekSec(week);
  const end = start + 7 * DAY;
  const settled = end + SETTLE <= now;
  const state = await readJson<StreamState>(path.join(dir, "state.json"));

  if (state?.complete && state.settled) return { rows: (await loadPages(dir)).flatMap((p) => p.rows), complete: true };
  if (!settled || (state && !state.settled)) await rm(dir, { recursive: true, force: true }); // still moving: refetch
  await mkdir(dir, { recursive: true });

  const pages = await loadPages(dir);
  const rows = pages.flatMap((p) => p.rows);
  let complete = pages.length > 0 && pages.at(-1)!.rows.length < PAGE_SIZE;
  let cursor: Cursor | null = rows.length ? { depositAddress: rows.at(-1)!.depositAddress, depositMemo: rows.at(-1)!.depositMemo } : null;

  try {
    while (!complete) {
      const url = transactionsUrl(streamParams(kind, start, end, cursor));
      const got = await getPage(url, jwt);
      const page: PageFile = { request: url, fetchedAt: new Date().toISOString(), rows: kind === "all" ? got.map(slim) : got };
      pages.push(page);
      await writeFile(path.join(dir, `page-${String(pages.length).padStart(4, "0")}.json`), JSON.stringify(page));
      rows.push(...page.rows);
      process.stdout.write(`  ${kind} ${week} page ${pages.length}: ${got.length} rows\n`);
      if (got.length < PAGE_SIZE) complete = true;
      else {
        const last = got.at(-1)!;
        if (cursor && last.depositAddress === cursor.depositAddress && last.depositMemo === cursor.depositMemo) {
          throw new Error(`cursor did not advance for ${kind} ${week}; check the pagination params`);
        }
        cursor = { depositAddress: last.depositAddress, depositMemo: last.depositMemo };
      }
    }
  } catch (e) {
    if (!(e instanceof BudgetExhausted)) throw e;
  }
  await writeFile(path.join(dir, "state.json"), JSON.stringify({ complete, settled, pages: pages.length } satisfies StreamState));
  return { rows, complete };
}

// ── Stonkbag's own baskets: live on-chain TVL (src/lib/stats.ts) plus the daily snapshot history ──────────────────────
async function loadStonkbag(): Promise<{ v: StonkbagTvl | null; note: string | null }> {
  if (!process.env.DATABASE_URL) return { v: null, note: "DATABASE_URL was not set when the data was built." };
  try {
    const { db, schema } = await import("../src/db");
    const { inArray, asc } = await import("drizzle-orm");
    const { basketStats } = await import("../src/lib/stats");
    const live = await db().select({ id: schema.baskets.id }).from(schema.baskets).where(inArray(schema.baskets.status, ["live", "closed"]));
    let tvl = 0, holders = 0;
    for (const b of live) {
      const s = await basketStats(b.id);
      if (!s) continue;
      tvl += s.tvlUsd;
      holders += s.holders;
    }
    const snaps = await db().select().from(schema.snapshots).orderBy(asc(schema.snapshots.takenAt));
    const byDay = new Map<string, Map<number, number>>(); // date → basket → latest tvl that day
    for (const s of snaps) {
      const d = s.takenAt.toISOString().slice(0, 10);
      if (!byDay.has(d)) byDay.set(d, new Map());
      byDay.get(d)!.set(s.basketId, s.tvlUsd);
    }
    const history = [...byDay.entries()].map(([date, m]) => ({ date, tvlUsd: Math.round([...m.values()].reduce((a, b) => a + b, 0) * 100) / 100 }));
    return { v: { at: new Date().toISOString(), tvlUsd: tvl, baskets: live.length, holders, history }, note: null };
  } catch (e) {
    return { v: null, note: `Could not read Stonkbag TVL: ${(e as Error).message.slice(0, 200)}` };
  }
}

async function renderThesisMd(data: ThesisData) {
  const tpl = await readFile(TEMPLATE, "utf8");
  await writeFile(THESIS_MD, renderTemplate(tpl, placeholderValues(data)));
  console.log(`wrote ${path.relative(ROOT, THESIS_MD)}`);
}

async function main() {
  if (process.argv.includes("--render-only")) {
    const data = await readJson<ThesisData>(OUT);
    if (!data) throw new Error(`${path.relative(ROOT, OUT)} not found; run pnpm thesis with EXPLORER_JWT first`);
    await renderThesisMd(data);
    return;
  }

  const jwt = process.env.EXPLORER_JWT;
  if (!jwt) {
    console.error(
      "EXPLORER_JWT is not set. Get an explorer-type key at https://partners.near-intents.org, put it in .env.local as\n" +
        "EXPLORER_JWT=..., then rerun pnpm thesis. data/thesis/thesis.json was not changed.",
    );
    process.exit(1);
  }

  const weeksBack = flag("weeks", 26);
  const totalWeeks = flag("total-weeks", 8);
  budget = flag("max-requests", 720); // ≈ 1 hour at 1 request / 5 s; rerun to continue
  const now = Math.floor(Date.now() / 1000);
  const ondoWeeks = weeksBetween(now - (weeksBack - 1) * 7 * DAY, now);
  const settledWeeks = ondoWeeks.filter((w) => weekSec(w) + 7 * DAY + SETTLE <= now);
  const allWeeks = settledWeeks.slice(-totalWeeks);
  console.log(`Ondo pulls: ${ondoWeeks.length} weeks from ${ondoWeeks[0]}; all-1Click pulls: ${allWeeks.length} weeks; budget ${budget} requests`);
  console.log(`API ${EXPLORER_BASE}; ${ONDO_IDS.length} Ondo asset ids`);

  const ondoTxs: ExplorerTx[] = [];
  let ondoComplete = true;
  for (const kind of ["ondo-in", "ondo-out"] as const) {
    for (const w of ondoWeeks) {
      const r = await pullWeek(kind, w, now, jwt);
      ondoTxs.push(...r.rows);
      ondoComplete &&= r.complete;
    }
  }
  if (!ondoComplete) {
    console.error(`Request budget used up before the Ondo pulls finished (${requests} requests). Pages so far are cached; rerun to continue. thesis.json not changed.`);
    process.exit(2);
  }

  const totals: WeekTotals[] = [];
  for (const w of [...allWeeks].reverse()) {
    const r = await pullWeek("all", w, now, jwt);
    if (r.complete) totals.push(...weekTotals(r.rows, ONDO_IDS).filter((t) => t.week === w));
    else console.warn(`  all-1Click pull for ${w} is incomplete; its share point is left out (rerun to continue)`);
  }

  const stonkbag = await loadStonkbag();
  const agg = aggregate({ ondoTxs, totals, weeks: ondoWeeks, ondoIds: ONDO_IDS, symbols: ONDO_SYMBOL, asOf: now, stonkbag: stonkbag.v });
  const data: ThesisData = {
    version: 1,
    generatedAt: new Date().toISOString(),
    asOf: new Date(now * 1000).toISOString(),
    source: {
      api: `${EXPLORER_BASE}/transactions`,
      statuses: "SUCCESS",
      ondoAssetIds: ONDO_IDS,
      weeksRequested: { ondo: ondoWeeks, all: allWeeks },
      requests,
    },
    ...agg,
    stonkbag: stonkbag.v,
    stonkbagNote: stonkbag.note,
  };
  await mkdir(path.dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(data, null, 2) + "\n");
  console.log(`wrote ${path.relative(ROOT, OUT)} (${requests} requests this run)`);
  const s = data.summary;
  console.log(`Ondo swaps: ${s.ondo_swaps_total}, volume $${s.ondo_volume_total}, traders ${s.ondo_traders_total}; last 30 days $${s.ondo_volume_30d}`);
  console.log(`share weeks covered: ${s.weeks_measured_vs_1click}; latest share ${s.ondo_share_latest ?? "n/a"} (${s.ondo_share_latest_week ?? "n/a"})`);
  await renderThesisMd(data);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
