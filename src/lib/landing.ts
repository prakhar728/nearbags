// Data for the landing page: real backtests and real reference prices, cached for an hour.
// Call after `await connection()` (request time) so the build never needs the database.
import "server-only";
import { cacheLife } from "next/cache";
import { ASSETS } from "@/lib/assets";
import { analyzeBasket } from "@/lib/analytics/basket";
import { listExploreBaskets } from "@/lib/basket-pages";
import { loadSeries } from "@/lib/prices/store";
import { SEED_BASKETS } from "@/lib/seeds";

export interface LandingData {
  hero: { name: string; start: string; dates: string[]; basket: number[]; assets: { id: string; values: number[] }[] } | null;
  tape: { id: string; ret: number; label: string }[];
  bags: { slug: string; name: string; tagline: string; assets: string[]; spark: number[]; label: string; value: number; isCagr: boolean; minBuy: number; feeBps: number; house: boolean }[];
}

/** Keep every k-th point (always the last) so the client gets ~n points. */
function thin<T>(xs: T[], n: number): T[] {
  if (xs.length <= n) return xs;
  const k = Math.ceil(xs.length / n);
  const out = xs.filter((_, i) => i % k === 0);
  if (out.at(-1) !== xs.at(-1)) out.push(xs.at(-1)!);
  return out;
}

export async function getLandingData(): Promise<LandingData> {
  "use cache: remote";
  cacheLife("hours");

  // Hero: AI Picks & Shovels, 5 years, $1,000 in.
  const seed = SEED_BASKETS.find((s) => s.slug === "ai-picks-and-shovels")!;
  const bt = await analyzeBasket(seed.weights, { maxYears: 5 });
  let hero: LandingData["hero"] = null;
  if (!("error" in bt)) {
    const idx = thin(bt.dates.map((_, i) => i), 260);
    hero = {
      name: seed.name,
      start: bt.start,
      dates: idx.map((i) => bt.dates[i]),
      basket: idx.map((i) => Math.round(bt.value[i])),
      assets: Object.entries(bt.assetPaths).map(([id, p]) => ({ id, values: idx.map((i) => Math.round(p[i] * 10)) })),
    };
  }

  // Tape: each asset's total return over 5 years (or since it listed).
  // Meme coins have weeks of history and their own risk notice: they stay off the landing tape.
  const assets = ASSETS.filter((a) => a.kind !== "stable" && a.kind !== "meme");
  const series = await loadSeries(assets.map((a) => a.refTicker));
  const fiveYearsAgo = new Date(Date.now() - 5 * 365.25 * 86_400_000).toISOString().slice(0, 10);
  const tape = assets
    .map((a) => {
      const s = series.get(a.refTicker);
      if (!s?.size) return null;
      const dates = [...s.keys()].sort();
      const from = dates.find((d) => d >= fiveYearsAgo)!;
      const ret = s.get(dates.at(-1)!)! / s.get(from)! - 1;
      const lateStart = Date.parse(from) - Date.parse(fiveYearsAgo) > 30 * 86_400_000;
      return { id: a.id, ret, label: lateStart ? `since ${from.slice(0, 4)}` : "5y" };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  // Bags: live baskets with a sparkline of their longest backtest window.
  const list = await listExploreBaskets();
  const bags: LandingData["bags"] = [];
  for (const b of list.filter((x) => x.status === "live")) {
    const a = await analyzeBasket(b.assets.map(({ assetId, weightBps }) => ({ assetId, weightBps })), { maxYears: 3 });
    if ("error" in a) continue;
    const cagr = a.windows["3y"]?.cagr ?? a.windows["1y"]?.cagr ?? null;
    bags.push({
      slug: b.slug,
      name: b.name,
      tagline: b.tagline,
      assets: b.assets.map((x) => x.assetId),
      spark: thin(a.value, 90).map((v) => Math.round(v)),
      label: cagr != null ? (a.windows["3y"] ? "3y/yr" : "1y") : "total",
      value: cagr ?? a.stats.totalReturn,
      isCagr: cagr != null,
      minBuy: b.minBuyUsd,
      feeBps: b.feeBps,
      house: b.isHouse,
    });
  }
  return { hero, tape, bags };
}
