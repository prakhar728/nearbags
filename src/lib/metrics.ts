// Live numbers for every basket at once (held, holders, creator holds, flows, buyers, volume), kept 5 minutes in the
// shared remote cache. Explore, profiles, basket pages and /api/stats all read this one entry, so these numbers cost the
// database a handful of small queries at most once per 5 minutes, however many people visit. Keep it that way: nothing
// here may read the database per visit or per basket.
import "server-only";
import { and, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { db, schema } from "@/db";
import { getAsset } from "@/lib/assets";
import { balancesOf } from "@/lib/intents/rpc";
import { livePrice } from "@/lib/prices/live";

export interface LiveMetrics {
  tvlUsd: number | null; // on-chain, from every proven position account; null if the read failed
  holders: number | null; // accounts holding at least $1
  creatorHoldsUsd: number | null;
  inflow7dUsd: number; // completed buys minus completed sells, last 7 days
  buyers: number; // different people with a completed buy, ever
  volume30dUsd: number; // completed buys plus sells, last 30 days
}

export const NO_METRICS: LiveMetrics = { tvlUsd: 0, holders: 0, creatorHoldsUsd: 0, inflow7dUsd: 0, buyers: 0, volume30dUsd: 0 };

/** Balance reads in flight at once (NEAR RPC, not the database). */
const RPC_PARALLEL = 6;

export async function allMetrics(): Promise<Record<number, LiveMetrics>> {
  "use cache: remote";
  if (process.env.__NEXT_USE_CACHE) {
    cacheLife({ stale: 300, revalidate: 300, expire: 3600 });
    cacheTag("basket-metrics");
  }
  const d = db();
  const [baskets, assets, positions, flows] = await Promise.all([
    d.select({ id: schema.baskets.id, creatorId: schema.baskets.creatorId }).from(schema.baskets).where(inArray(schema.baskets.status, ["pending", "live", "closed", "hidden"])),
    d.select({ basketId: schema.basketAssets.basketId, assetId: schema.basketAssets.assetId }).from(schema.basketAssets),
    // Only accounts that proved who holds them count: adding the wallet as recovery key needs the account's own
    // signature (re-audit N4), so a registered-but-unproven account can't inflate held, holders or creator holds.
    d
      .select({ basketId: schema.positions.basketId, userId: schema.positions.userId, accountId: schema.positions.accountId })
      .from(schema.positions)
      .where(isNotNull(schema.positions.recoveryKeyAddedAt)),
    d
      .select({
        basketId: schema.positions.basketId,
        buyers: sql<number>`count(distinct ${schema.positions.userId}) filter (where ${schema.orders.kind} = 'buy')::int`,
        net7d: sql<number>`coalesce(sum(case when ${schema.orders.createdAt} >= now() - interval '7 days' then case ${schema.orders.kind} when 'buy' then coalesce(${schema.orders.usdIn}, 0) when 'sell' then -coalesce(${schema.orders.usdOut}, 0) else 0 end end), 0)::float8`,
        vol30d: sql<number>`coalesce(sum(case when ${schema.orders.createdAt} >= now() - interval '30 days' then case ${schema.orders.kind} when 'buy' then coalesce(${schema.orders.usdIn}, 0) when 'sell' then coalesce(${schema.orders.usdOut}, 0) else 0 end end), 0)::float8`,
      })
      .from(schema.orders)
      .innerJoin(schema.positions, eq(schema.orders.positionId, schema.positions.id))
      .where(inArray(schema.orders.status, ["complete", "partial"]))
      .groupBy(schema.positions.basketId),
  ]);

  const out: Record<number, LiveMetrics> = {};
  for (const b of baskets) out[b.id] = { ...NO_METRICS };
  const creatorOf = new Map(baskets.map((b) => [b.id, b.creatorId]));

  for (const f of flows) {
    const m = out[f.basketId];
    if (!m) continue;
    m.buyers = Number(f.buyers) || 0;
    m.inflow7dUsd = Number(f.net7d) || 0;
    m.volume30dUsd = Number(f.vol30d) || 0;
  }

  // Held value: each account's balances of its basket's assets (plus USDC), at live prices.
  const assetsOf = new Map<number, string[]>();
  for (const a of assets) if (out[a.basketId]) assetsOf.set(a.basketId, [...(assetsOf.get(a.basketId) ?? []), a.assetId]);
  const ids = [...new Set([...[...assetsOf.values()].flat(), "USDC"])];
  const prices = new Map(await Promise.all(ids.map(async (id) => [id, await livePrice(id).then((p) => p.price).catch(() => 0)] as const)));

  const held = positions.filter((p) => out[p.basketId]);
  const failed = new Set<number>();
  for (let i = 0; i < held.length; i += RPC_PARALLEL) {
    await Promise.all(
      held.slice(i, i + RPC_PARALLEL).map(async (p) => {
        const list = [...new Set([...(assetsOf.get(p.basketId) ?? []), "USDC"])].map(getAsset);
        const bals = await balancesOf(p.accountId, list.map((a) => a.intentsAssetId)).catch(() => null);
        if (!bals) return void failed.add(p.basketId);
        const value = bals.reduce((s, b, k) => s + (Number(b) / 10 ** list[k].decimals) * (prices.get(list[k].id) ?? 0), 0);
        const m = out[p.basketId];
        m.tvlUsd! += value;
        if (value >= 1) m.holders!++;
        if (p.userId === creatorOf.get(p.basketId)) m.creatorHoldsUsd = value;
      }),
    );
  }
  // A failed read would under-count, so show "—" rather than a wrong number (for 5 minutes, until the next refresh).
  for (const id of failed) Object.assign(out[id], { tvlUsd: null, holders: null, creatorHoldsUsd: null });
  return out;
}

/** Different people who bought any of a creator's bags, not counting the creator, by creator id. Same 5-minute shared
 *  cache as allMetrics: one small query per refresh, never per visit. Per-bag buyer counts can't be summed for this,
 *  because one person buying two of a creator's bags would count twice. */
export async function creatorBuyers(): Promise<Record<number, number>> {
  "use cache: remote";
  if (process.env.__NEXT_USE_CACHE) {
    cacheLife({ stale: 300, revalidate: 300, expire: 3600 });
    cacheTag("basket-metrics");
  }
  const rows = await db()
    .select({ creatorId: schema.baskets.creatorId, buyers: sql<number>`count(distinct ${schema.positions.userId})::int` })
    .from(schema.orders)
    .innerJoin(schema.positions, eq(schema.orders.positionId, schema.positions.id))
    .innerJoin(schema.baskets, eq(schema.positions.basketId, schema.baskets.id))
    .where(
      and(
        eq(schema.orders.kind, "buy"),
        inArray(schema.orders.status, ["complete", "partial"]),
        ne(schema.positions.userId, schema.baskets.creatorId),
      ),
    )
    .groupBy(schema.baskets.creatorId);
  return Object.fromEntries(rows.map((r) => [r.creatorId, Number(r.buyers) || 0]));
}
