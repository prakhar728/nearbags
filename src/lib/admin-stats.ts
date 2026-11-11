// Raw rows for the admin Stats tab. Only the small tables (wallets, bags, positions, orders, fees, agent runs), never
// price history, so a read is a few KB. "use cache: remote" with a 5-minute refresh: opening the tab again doesn't
// touch Neon, and nothing keeps the database awake. The client does every sum and chart from these rows.
import "server-only";
import { cacheLife } from "next/cache";
import { desc } from "drizzle-orm";
import { db, schema } from "@/db";

export interface AdminStats {
  at: string;
  users: { id: number; chain: string; address: string; handle: string | null; isAdmin: boolean; createdAt: string }[];
  baskets: { id: number; slug: string; name: string; status: string; isHouse: boolean; creatorId: number; feeBps: number; hasAgent: boolean }[];
  positions: { id: number; userId: number; basketId: number; createdAt: string; agentOn: boolean }[];
  orders: { id: number; positionId: number; kind: string; status: string; usdIn: number | null; usdOut: number | null; error: string | null; createdAt: string }[];
  fees: { orderId: number; kind: "creator" | "platform"; usdc: number; status: string; createdAt: string }[];
  runs: { id: number; basketId: number; trigger: string; status: string; reason: string | null; decideTx: string | null; error: string | null; createdAt: string }[];
}

const iso = (d: Date | null) => (d ? d.toISOString() : "");

export async function getAdminStats(): Promise<AdminStats> {
  "use cache: remote";
  cacheLife({ stale: 60, revalidate: 300, expire: 3600 });
  const s = schema;
  const [users, baskets, positions, orders, fees, runs] = await Promise.all([
    db().select({ id: s.users.id, chain: s.users.walletChain, address: s.users.walletAddress, handle: s.users.handle, isAdmin: s.users.isAdmin, createdAt: s.users.createdAt }).from(s.users),
    db().select({ id: s.baskets.id, slug: s.baskets.slug, name: s.baskets.name, status: s.baskets.status, isHouse: s.baskets.isHouse, creatorId: s.baskets.creatorId, feeBps: s.baskets.feeBps, agent: s.baskets.agent }).from(s.baskets),
    db().select({ id: s.positions.id, userId: s.positions.userId, basketId: s.positions.basketId, createdAt: s.positions.createdAt, agentKeyAddedAt: s.positions.agentKeyAddedAt }).from(s.positions),
    db()
      .select({ id: s.orders.id, positionId: s.orders.positionId, kind: s.orders.kind, status: s.orders.status, usdIn: s.orders.usdIn, usdOut: s.orders.usdOut, error: s.orders.error, createdAt: s.orders.createdAt })
      .from(s.orders)
      .orderBy(desc(s.orders.id))
      .limit(5000),
    db().select({ orderId: s.feeEvents.orderId, kind: s.feeEvents.recipientKind, amount: s.feeEvents.amount, status: s.feeEvents.status, createdAt: s.feeEvents.createdAt }).from(s.feeEvents),
    db()
      .select({ id: s.agentRuns.id, basketId: s.agentRuns.basketId, trigger: s.agentRuns.trigger, status: s.agentRuns.status, reason: s.agentRuns.reason, decideTx: s.agentRuns.decideTx, error: s.agentRuns.error, createdAt: s.agentRuns.createdAt })
      .from(s.agentRuns)
      .orderBy(desc(s.agentRuns.id))
      .limit(200),
  ]);
  return {
    at: new Date().toISOString(),
    users: users.map((u) => ({ ...u, createdAt: iso(u.createdAt) })),
    baskets: baskets.map(({ agent, ...b }) => ({ ...b, hasAgent: agent != null })),
    positions: positions.map(({ agentKeyAddedAt, ...p }) => ({ ...p, createdAt: iso(p.createdAt), agentOn: agentKeyAddedAt != null })),
    orders: orders.map((o) => ({ ...o, error: o.error ? o.error.slice(0, 200) : null, createdAt: iso(o.createdAt) })),
    // Fees are paid in USDC (6 decimals).
    fees: fees.map((f) => ({ orderId: f.orderId, kind: f.kind, usdc: Number(f.amount) / 1e6, status: f.status, createdAt: iso(f.createdAt) })),
    runs: runs.map((r) => ({ ...r, reason: r.reason ? r.reason.slice(0, 400) : null, error: r.error ? r.error.slice(0, 200) : null, createdAt: iso(r.createdAt) })),
  };
}
