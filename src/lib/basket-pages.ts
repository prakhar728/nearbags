// Page-level reads for Explore, the basket page and creator profiles (server only).
// Basket and profile reads are cached and tagged; the API routes that write them revalidate the tags.
import "server-only";
import { and, desc, eq, gte, inArray, or, sql } from "drizzle-orm";
import { cacheLife, cacheTag, revalidateTag } from "next/cache";
import { db, schema } from "@/db";
import { getBasketBySlug, listBasketsByCreator, listPublicBaskets, type BasketView } from "@/lib/baskets";
import { basketStats } from "@/lib/stats";

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

export interface LiveMetrics {
  tvlUsd: number | null; // on-chain, from every position account (lib/stats, cached 5 min); null if the read failed
  holders: number | null;
  creatorHoldsUsd: number | null;
  inflow7dUsd: number; // completed buys minus completed sells, last 7 days
}

/** Request-time metrics: on-chain TVL, holders and creator holdings, plus 7-day net inflow from orders. */
export async function liveMetrics(basketIds: number[]): Promise<Map<number, LiveMetrics>> {
  const out = new Map<number, LiveMetrics>(basketIds.map((id) => [id, { tvlUsd: null, holders: null, creatorHoldsUsd: null, inflow7dUsd: 0 }]));
  if (!basketIds.length) return out;
  const stats = await Promise.all(basketIds.map((id) => basketStats(id).catch(() => null)));
  for (const st of stats) if (st) Object.assign(out.get(st.basketId)!, { tvlUsd: st.tvlUsd, holders: st.holders, creatorHoldsUsd: st.creatorHoldsUsd });

  const since = new Date(Date.now() - 7 * 86_400_000);
  const flows = await db()
    .select({
      basketId: schema.positions.basketId,
      net: sql<number>`coalesce(sum(case when ${schema.orders.kind} = 'buy' then coalesce(${schema.orders.usdIn}, 0) when ${schema.orders.kind} = 'sell' then -coalesce(${schema.orders.usdOut}, 0) else 0 end), 0)::float8`,
    })
    .from(schema.orders)
    .innerJoin(schema.positions, eq(schema.orders.positionId, schema.positions.id))
    .where(
      and(
        inArray(schema.positions.basketId, basketIds),
        gte(schema.orders.createdAt, since),
        or(eq(schema.orders.status, "complete"), eq(schema.orders.status, "partial")),
      ),
    )
    .groupBy(schema.positions.basketId);
  for (const f of flows) out.get(f.basketId)!.inflow7dUsd = Number(f.net) || 0;
  return out;
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
