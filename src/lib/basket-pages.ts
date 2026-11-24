// Page-level reads for Explore, the basket page and creator profiles (server only).
// Basket and profile reads are cached and tagged; the API routes that write them revalidate the tags.
import "server-only";
import { and, desc, eq, or, sql } from "drizzle-orm";
import { cacheLife, cacheTag, revalidateTag } from "next/cache";
import { db, schema } from "@/db";
import { getBasketBySlug, listBasketsByCreator, listPublicBaskets, type BasketView } from "@/lib/baskets";
import { allMetrics, NO_METRICS, type LiveMetrics } from "@/lib/metrics";

export const TAG_BASKETS = "baskets";
export const TAG_PROFILES = "profiles";
export const basketTag = (slug: string) => `basket:${slug}`;

export interface BasketEdit {
  field: string;
  oldValue: string | null;
  newValue: string | null;
  editedAt: string;
}

/** Any status except draft. Hidden and pending baskets stay reachable by link (holders, the creator). */
export async function getBasketPage(slug: string): Promise<{ basket: BasketView; edits: BasketEdit[] } | null> {
  "use cache: remote";
  cacheLife("minutes");
  cacheTag(basketTag(slug), TAG_BASKETS);
  const basket = await getBasketBySlug(slug);
  if (!basket || basket.status === "draft") return null;
  const rows = await db()
    .select()
    .from(schema.basketEdits)
    .where(eq(schema.basketEdits.basketId, basket.id))
    .orderBy(desc(schema.basketEdits.editedAt))
    .limit(200);
  return {
    basket,
    edits: rows.map((r) => ({ field: r.field, oldValue: r.oldValue, newValue: r.newValue, editedAt: r.editedAt.toISOString() })),
  };
}

export async function listExploreBaskets(): Promise<BasketView[]> {
  "use cache: remote";
  cacheLife("minutes");
  cacheTag(TAG_BASKETS);
  return (await listPublicBaskets()).filter(wasPublished);
}

/** A pending basket closed before its self-buy was never public: keep it off Explore and profiles. */
const wasPublished = (b: BasketView) => b.status === "live" || b.publishedAt != null;

export type { LiveMetrics } from "@/lib/metrics";

/** Live numbers for these baskets, from the shared 5-minute cache in lib/metrics (no database read per visit). */
export async function liveMetrics(basketIds: number[]): Promise<Map<number, LiveMetrics>> {
  const all = await allMetrics().catch((e) => {
    console.error("live metrics", e);
    return {} as Record<number, LiveMetrics>;
  });
  return new Map(basketIds.map((id) => [id, all[id] ?? { ...NO_METRICS, tvlUsd: null, holders: null, creatorHoldsUsd: null }]));
}

/** The creator's public bags and what is held across them. Both reads are cached, so this costs no database read. */
export async function creatorSpotlight(creatorId: number): Promise<{ bags: number; heldUsd: number | null }> {
  const [bags, all] = await Promise.all([listExploreBaskets(), allMetrics().catch(() => ({}) as Record<number, LiveMetrics>)]);
  const mine = bags.filter((b) => b.creator.id === creatorId);
  const held = mine.map((b) => all[b.id]?.tvlUsd);
  return { bags: mine.length, heldUsd: held.some((x) => x == null) ? null : held.reduce<number>((s, x) => s + (x ?? 0), 0) };
}

export interface CreatorProfile {
  id: number;
  handle: string | null;
  address: string;
  chain: "near" | "evm";
  bio: string | null;
  xUrl: string | null;
  createdAt: string;
  baskets: BasketView[];
  /** They made one of their bags a public treasury (/t/<handle>). */
  hasTreasury: boolean;
}

/** Look up by handle (case-insensitive), falling back to the wallet address for creators without one. */
export async function getCreatorProfile(handleOrAddress: string): Promise<CreatorProfile | null> {
  "use cache: remote";
  cacheLife("minutes");
  cacheTag(TAG_PROFILES, TAG_BASKETS);
  const key = handleOrAddress.toLowerCase();
  const [u] = await db()
    .select()
    .from(schema.users)
    .where(or(eq(schema.users.handle, key), sql`lower(${schema.users.walletAddress}) = ${key}`))
    .limit(1);
  if (!u) return null;
  return {
    id: u.id,
    handle: u.handle,
    address: u.walletAddress,
    chain: u.walletChain,
    bio: u.bio,
    xUrl: u.xUrl,
    createdAt: u.createdAt.toISOString(),
    baskets: (await listBasketsByCreator(u.id)).filter(wasPublished),
    hasTreasury: (await db().select({ id: schema.treasuries.id }).from(schema.treasuries).where(eq(schema.treasuries.userId, u.id))).length > 0,
  };
}

/** Pending baskets of one creator (only shown to that creator). Not cached: read at request time. */
export async function listPendingByCreator(creatorId: number) {
  return db()
    .select({ slug: schema.baskets.slug, name: schema.baskets.name, createdAt: schema.baskets.createdAt })
    .from(schema.baskets)
    .where(and(eq(schema.baskets.creatorId, creatorId), eq(schema.baskets.status, "pending")))
    .orderBy(desc(schema.baskets.createdAt));
}

/** Call after any basket write so pages show it on the next request. */
export function revalidateBasket(slug: string) {
  revalidateTag(basketTag(slug), { expire: 0 });
  revalidateTag(TAG_BASKETS, { expire: 0 });
}

export function revalidateProfiles() {
  revalidateTag(TAG_PROFILES, { expire: 0 });
}
