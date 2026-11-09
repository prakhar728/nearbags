// Basket stats from chain (spec §5.1, §7.3): TVL and holders from every position account's balances on intents.near,
// priced at reference prices; creator holdings from the creator's own position; 7-day net inflow from orders.
import "server-only";
import { and, eq, gte, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { getAsset } from "@/lib/assets";
import { getBasketById } from "@/lib/baskets";
import { balancesOf } from "@/lib/intents/rpc";
import { livePrice } from "@/lib/prices/live";

export interface BasketStats {
  basketId: number;
  tvlUsd: number;
  holders: number;
  creatorHoldsUsd: number;
  netInflow7dUsd: number;
  at: string;
}

const TTL = 5 * 60_000;
const cache = new Map<number, { at: number; v: BasketStats }>();

export async function basketStats(basketId: number): Promise<BasketStats | null> {
  const hit = cache.get(basketId);
  if (hit && Date.now() - hit.at < TTL) return hit.v;
  const basket = await getBasketById(basketId);
  if (!basket) return null;

  const assets = [...new Set([...basket.assets.map((a) => a.assetId), "USDC"])].map(getAsset);
  const prices = await Promise.all(assets.map((a) => livePrice(a.id).then((p) => p.price).catch(() => 0)));
  const positions = await db().select().from(schema.positions).where(eq(schema.positions.basketId, basketId));

  let tvl = 0;
  let holders = 0;
  let creatorHolds = 0;
  for (const p of positions) {
    const bals = await balancesOf(p.accountId, assets.map((a) => a.intentsAssetId)).catch(() => assets.map(() => "0"));
    const value = bals.reduce((s, b, i) => s + (Number(b) / 10 ** assets[i].decimals) * prices[i], 0);
    tvl += value;
    if (value >= 1) holders++;
    if (p.userId === basket.creator.id) creatorHolds = value;
  }

  const since = new Date(Date.now() - 7 * 86_400_000);
  const posIds = positions.map((p) => p.id);
  let inflow = 0;
  if (posIds.length) {
    const orders = await db()
      .select()
      .from(schema.orders)
      .where(and(inArray(schema.orders.positionId, posIds), gte(schema.orders.createdAt, since), inArray(schema.orders.status, ["complete", "partial"])));
    for (const o of orders) {
      if (o.kind === "buy") inflow += o.usdIn ?? 0;
      if (o.kind === "sell") {
        const [payout] = await db().select().from(schema.orderLegs).where(and(eq(schema.orderLegs.orderId, o.id), eq(schema.orderLegs.seq, 100)));
        if (payout?.status === "success") inflow -= Number(payout.amountIn) / 1e6;
      }
    }
  }

  const v = { basketId, tvlUsd: tvl, holders, creatorHoldsUsd: creatorHolds, netInflow7dUsd: inflow, at: new Date().toISOString() };
  cache.set(basketId, { at: Date.now(), v });
  return v;
}
