// What the share card and share page show about a basket: name, weights, a 3-year (or shorter) backtest sparkline.
import "server-only";
import { cacheLife } from "next/cache";
import { analyzeBasket } from "@/lib/analytics/basket";
import { getBasketBySlug } from "@/lib/baskets";
import type { BasketCardData } from "./cards";

const thin = (xs: number[], n: number) => (xs.length <= n ? xs : Array.from({ length: n }, (_, i) => xs[Math.round((i * (xs.length - 1)) / (n - 1))]));

export const shortWallet = (a: string) => (a.length > 20 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);

export async function basketCardData(slug: string): Promise<BasketCardData | null> {
  "use cache";
  cacheLife("hours");
  const b = await getBasketBySlug(slug);
  if (!b || b.status === "draft" || b.status === "hidden") return null;
  const weights = b.assets.map(({ assetId, weightBps }) => ({ assetId, weightBps }));
  const a = await analyzeBasket(weights, { maxYears: 3 });
  const ok = !("error" in a);
  const cagr = ok ? (a.windows["3y"]?.cagr ?? a.windows["1y"]?.cagr ?? null) : null;
  return {
    name: b.name,
    tagline: b.tagline,
    by: b.creator.handle ? `@${b.creator.handle}` : shortWallet(b.creator.address),
    assets: weights.map((w) => ({ id: w.assetId, weightBps: w.weightBps })),
    spark: ok ? thin(a.value, 120).map((v) => Math.round(v)) : [],
    stat: !ok ? null : cagr != null ? { value: cagr, label: a.windows["3y"] ? "backtest 3y, per year" : "backtest 1y" } : { value: a.stats.totalReturn, label: "backtest total" },
  };
}
