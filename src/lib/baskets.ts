// Basket reads and writes (server only). Baskets are frozen after publish except text fields (spec §5.3).
import "server-only";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { minBuyUsd } from "@/lib/basket-rules";
import type { WeightInput } from "@/lib/trade/types";

export const PLATFORM_FEE_BPS = () => Number(process.env.PLATFORM_FEE_BPS ?? 25);

export interface BasketView {
  id: number;
  slug: string;
  name: string;
  tagline: string;
  thesis: string;
  risks: string;
  horizon: "3m" | "1y" | "3y+";
  exitSignal: string | null;
  deepDive: string | null;
  feeBps: number;
  isHouse: boolean;
  status: "draft" | "pending" | "live" | "closed" | "hidden";
  publishedAt: string | null;
  creator: { id: number; handle: string | null; address: string; chain: "near" | "evm" };
  assets: (WeightInput & { why: string })[];
  minBuyUsd: number;
}

type BasketRow = typeof schema.baskets.$inferSelect;

async function hydrate(rows: BasketRow[]): Promise<BasketView[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const assets = await db().select().from(schema.basketAssets).where(inArray(schema.basketAssets.basketId, ids)).orderBy(desc(schema.basketAssets.weightBps));
  const creators = await db().select().from(schema.users).where(inArray(schema.users.id, [...new Set(rows.map((r) => r.creatorId))]));
  const byCreator = new Map(creators.map((u) => [u.id, u]));
  return rows.map((r) => {
    const a = assets.filter((x) => x.basketId === r.id).map((x) => ({ assetId: x.assetId, weightBps: x.weightBps, why: x.why }));
    const u = byCreator.get(r.creatorId)!;
    return {
      id: r.id,
      slug: r.slug,
      name: r.name,
      tagline: r.tagline,
      thesis: r.thesis,
      risks: r.risks,
      horizon: r.horizon,
      exitSignal: r.exitSignal,
      deepDive: r.deepDive,
      feeBps: r.feeBps,
      isHouse: r.isHouse,
      status: r.status,
      publishedAt: r.publishedAt?.toISOString() ?? null,
      creator: { id: u.id, handle: u.handle, address: u.walletAddress, chain: u.walletChain },
      assets: a,
      minBuyUsd: minBuyUsd(a, r.feeBps + PLATFORM_FEE_BPS()),
    };
  });
}

export async function getBasketBySlug(slug: string): Promise<BasketView | null> {
  const rows = await db().select().from(schema.baskets).where(eq(schema.baskets.slug, slug));
  return (await hydrate(rows))[0] ?? null;
}

export async function getBasketById(id: number): Promise<BasketView | null> {
  const rows = await db().select().from(schema.baskets).where(eq(schema.baskets.id, id));
  return (await hydrate(rows))[0] ?? null;
}

/** Baskets visible on Explore: live and closed (closed show a tag, no buy). Hidden and drafts never. */
export async function listPublicBaskets(): Promise<BasketView[]> {
  const rows = await db()
    .select()
    .from(schema.baskets)
    .where(inArray(schema.baskets.status, ["live", "closed"]))
    .orderBy(desc(schema.baskets.publishedAt), asc(schema.baskets.id));
  return hydrate(rows);
}

export async function listBasketsByCreator(creatorId: number): Promise<BasketView[]> {
  const rows = await db()
    .select()
    .from(schema.baskets)
    .where(and(eq(schema.baskets.creatorId, creatorId), inArray(schema.baskets.status, ["live", "closed"])))
    .orderBy(desc(schema.baskets.publishedAt));
  return hydrate(rows);
}

/** Someone can hold keys for this id: a named account (has a dot), a NEAR implicit id, or an EVM address. */
const ownable = (a: string) => a.includes(".") || /^[0-9a-f]{64}$/.test(a) || /^0x[0-9a-f]{40}$/.test(a);

/** Intents account that receives a creator's fees: their NEAR account, or their EVM address (eth-implicit).
 *  A creator id nobody can own (the seed "house" user) would strand the fee in intents.near, so it goes to the
 *  platform fee account instead. */
export function creatorFeeAccount(c: BasketView["creator"]): string {
  const a = c.chain === "evm" ? c.address.toLowerCase() : c.address;
  if (ownable(a)) return a;
  const platform = process.env.PLATFORM_FEE_ACCOUNT;
  if (!platform) throw new Error("This basket's creator can't receive fees and PLATFORM_FEE_ACCOUNT isn't set.");
  return platform;
}
