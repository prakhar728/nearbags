// Portfolio (spec §5.7). Holdings come from intents.near (source of truth); the database only says which accounts are
// whose. Value = reference prices; exit value = what dry sell quotes would actually pay (cached 2 min).
import "server-only";
import { asc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { getAsset, USDC } from "@/lib/assets";
import { getBasketById } from "@/lib/baskets";
import { balancesOf } from "@/lib/intents/rpc";
import { oneclick } from "@/lib/oneclick";
import { livePrice } from "@/lib/prices/live";

const EXIT_TTL = 120_000;
const exitCache = new Map<string, { at: number; usd: number | null }>();

async function exitUsd(assetId: string, account: string, amount: string): Promise<number | null> {
  const a = getAsset(assetId);
  if (a.id === "USDC") return Number(amount) / 1e6;
  const key = `${a.id}:${amount}`;
  const hit = exitCache.get(key);
  if (hit && Date.now() - hit.at < EXIT_TTL) return hit.usd;
  let v: number | null = null;
  try {
    const q = await oneclick.quote({ dry: true, slippageTolerance: 100, originAsset: a.intentsAssetId, depositType: "INTENTS", destinationAsset: USDC.intentsAssetId, amount, recipient: account, recipientType: "INTENTS", refundTo: account, refundType: "INTENTS" });
    v = Number(q.quote.amountOut) / 1e6;
  } catch {
    v = null; // not sellable right now (market closed, below minimum swap)
  }
  exitCache.set(key, { at: Date.now(), usd: v });
  return v;
}

export interface Holding {
  assetId: string;
  units: number;
  raw: string;
  valueUsd: number;
  exitUsd: number | null;
  targetBps: number;
  weightNowBps: number;
}

export async function portfolio(userId: number) {
  const positions = await db().select().from(schema.positions).where(eq(schema.positions.userId, userId));
  const orders = positions.length
    ? await db().select().from(schema.orders).where(inArray(schema.orders.positionId, positions.map((p) => p.id))).orderBy(asc(schema.orders.createdAt))
    : [];

  const out = [];
  for (const p of positions) {
    const basket = await getBasketById(p.basketId);
    if (!basket) continue;
    const assets = [...new Map([...basket.assets.map((a) => [a.assetId, a.weightBps] as const), ["USDC", basket.assets.find((a) => a.assetId === "USDC")?.weightBps ?? 0] as const]).entries()];
    const bals = await balancesOf(p.accountId, assets.map(([id]) => getAsset(id).intentsAssetId));
    const holdings: Holding[] = [];
    for (let i = 0; i < assets.length; i++) {
      const [assetId, targetBps] = assets[i];
      const a = getAsset(assetId);
      const raw = bals[i];
      if (raw === "0" && targetBps === 0) continue;
      const units = Number(raw) / 10 ** a.decimals;
      const price = units > 0 ? (await livePrice(a.id).catch(() => null))?.price ?? 0 : 0;
      holdings.push({ assetId, units, raw, valueUsd: units * price, exitUsd: units > 0 ? await exitUsd(assetId, p.accountId, raw) : 0, targetBps, weightNowBps: 0 });
    }
    const value = holdings.reduce((s, h) => s + h.valueUsd, 0);
    for (const h of holdings) h.weightNowBps = value > 0 ? Math.round((h.valueUsd / value) * 10_000) : 0;
    const exitKnown = holdings.every((h) => h.exitUsd != null);
    const exit = exitKnown ? holdings.reduce((s, h) => s + (h.exitUsd ?? 0), 0) : null;

    // Cost basis: buys add what was paid; a sell of X% removes X% of the basis.
    let cost = 0;
    for (const o of orders.filter((o) => o.positionId === p.id)) {
      if (o.kind === "buy" && ["complete", "partial"].includes(o.status)) cost += o.usdIn ?? 0;
      if (o.kind === "sell" && ["complete", "partial"].includes(o.status) && o.sellPct) cost *= 1 - o.sellPct / 100;
    }
    const open = orders.filter((o) => o.positionId === p.id && ["awaiting_deposit", "funded", "fees_paid", "legs_running"].includes(o.status)).at(-1);
    const lastBuy = orders.filter((o) => o.positionId === p.id && o.kind === "buy" && ["complete", "partial"].includes(o.status)).at(-1);
    out.push({
      positionId: p.id,
      accountId: p.accountId,
      recoveryKeyAdded: Boolean(p.recoveryKeyAddedAt),
      basket: { id: basket.id, slug: basket.slug, name: basket.name, status: basket.status },
      holdings,
      valueUsd: value,
      exitUsd: exit,
      costUsd: cost,
      pnlUsd: cost > 0 ? (exit ?? value) - cost : null,
      openOrderId: open?.id ?? null,
      openOrderKind: open?.kind ?? null,
      boughtAt: lastBuy?.createdAt ?? null,
    });
  }
  return out.filter((x) => x.valueUsd > 0.005 || x.openOrderId);
}

export type PortfolioPosition = Awaited<ReturnType<typeof portfolio>>[number];

