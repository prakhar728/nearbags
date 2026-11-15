// Public treasuries (plan feature 3): a creator makes one of their own positions public and can route the creator
// fees their bags earn into it. Spending works like any position: only the owner's keys (plus the agent's, if they
// opted in) can move it. The ledger maths is in treasury-ledger.ts.
import "server-only";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { getAsset, USDC } from "@/lib/assets";
import { HttpError } from "@/lib/auth/session";
import { creatorFeeAccount, getBasketById, type BasketView } from "@/lib/baskets";
import { balancesOf } from "@/lib/intents/rpc";
import { livePrice } from "@/lib/prices/live";
import { buildLedger, concentration } from "./treasury-ledger";

export type Treasury = typeof schema.treasuries.$inferSelect;

export async function treasuryOf(userId: number): Promise<Treasury | null> {
  const [t] = await db().select().from(schema.treasuries).where(eq(schema.treasuries.userId, userId));
  return t ?? null;
}

/** Where a creator's fee goes: their treasury account when they route fees there, else their wallet's account. */
export async function creatorFeeRecipient(creator: BasketView["creator"]): Promise<string> {
  const [row] = await db()
    .select({ accountId: schema.positions.accountId })
    .from(schema.treasuries)
    .innerJoin(schema.positions, eq(schema.positions.id, schema.treasuries.positionId))
    .where(and(eq(schema.treasuries.userId, creator.id), eq(schema.treasuries.routeFees, true)));
  return row?.accountId ?? creatorFeeAccount(creator);
}

/** The owner's positions that can become their treasury, and the current choice. */
export async function treasurySettings(userId: number) {
  const positions = await db().select().from(schema.positions).where(and(eq(schema.positions.userId, userId), eq(schema.positions.kind, "own")));
  const baskets = positions.length
    ? await db().select({ id: schema.baskets.id, name: schema.baskets.name, slug: schema.baskets.slug }).from(schema.baskets).where(inArray(schema.baskets.id, positions.map((p) => p.basketId)))
    : [];
  const t = await treasuryOf(userId);
  return {
    treasury: t ? { positionId: t.positionId, routeFees: t.routeFees } : null,
    options: positions.map((p) => {
      const b = baskets.find((x) => x.id === p.basketId)!;
      return { positionId: p.id, basket: b.name, slug: b.slug, recoveryKeyAdded: Boolean(p.recoveryKeyAddedAt) };
    }),
  };
}

/** Make one of your positions your public treasury (or stop, with positionId null). */
export async function setTreasury(userId: number, p: { positionId: number | null; routeFees: boolean }) {
  if (p.positionId == null) {
    await db().delete(schema.treasuries).where(eq(schema.treasuries.userId, userId));
    return null;
  }
  const [pos] = await db()
    .select()
    .from(schema.positions)
    .where(and(eq(schema.positions.id, p.positionId), eq(schema.positions.userId, userId), eq(schema.positions.kind, "own")));
  if (!pos) throw new HttpError(404, "That bag isn't one of yours.");
  // Fees will pile up here: the owner's wallet must be able to recover the account on any device.
  if (!pos.recoveryKeyAddedAt) throw new HttpError(409, "Add your wallet as this bag's recovery key first (Portfolio → the bag → Recovery).");
  const now = new Date();
  const [row] = await db()
    .insert(schema.treasuries)
    .values({ userId, positionId: pos.id, routeFees: p.routeFees })
    .onConflictDoUpdate({ target: schema.treasuries.userId, set: { positionId: pos.id, routeFees: p.routeFees, updatedAt: now } })
    .returning();
  await db().insert(schema.auditLog).values({ actor: `user:${userId}`, action: "treasury.set", target: String(pos.id), details: { routeFees: p.routeFees } });
  return row;
}

/** Everything the public treasury page shows, or null when this creator has no treasury. */
export async function treasuryPage(handleOrAddress: string) {
  const key = handleOrAddress.toLowerCase();
  const [u] = await db()
    .select()
    .from(schema.users)
    .where(or(eq(schema.users.handle, key), sql`lower(${schema.users.walletAddress}) = ${key}`))
    .limit(1);
  if (!u) return null;
  const t = await treasuryOf(u.id);
  if (!t) return null;
  const [pos] = await db().select().from(schema.positions).where(eq(schema.positions.id, t.positionId));
  const basket = (await getBasketById(pos.basketId))!;

  // Holdings: the bag's assets plus any idle USDC, at reference prices.
  const ids = [...new Set([...basket.assets.map((a) => a.assetId), "USDC"])];
  const bals = await balancesOf(pos.accountId, ids.map((id) => getAsset(id).intentsAssetId));
  const holdings = await Promise.all(
    ids.map(async (id, i) => {
      const a = getAsset(id);
      const units = Number(bals[i]) / 10 ** a.decimals;
      const price = units > 0 ? ((await livePrice(id).catch(() => null))?.price ?? 0) : 0;
      return { assetId: id, units, valueUsd: units * price, targetBps: basket.assets.find((x) => x.assetId === id)?.weightBps ?? 0 };
    }),
  );
  const shown = holdings.filter((h) => h.units > 0 || h.targetBps > 0);
  const valueUsd = shown.reduce((s, h) => s + h.valueUsd, 0);

  // Ledger rows: fees paid into this account, the owner's own top-ups, fees those paid, and every settled swap.
  const fees = await db()
    .select({ at: schema.feeEvents.createdAt, amount: schema.feeEvents.amount, basket: schema.baskets.name })
    .from(schema.feeEvents)
    .innerJoin(schema.orders, eq(schema.orders.id, schema.feeEvents.orderId))
    .innerJoin(schema.positions, eq(schema.positions.id, schema.orders.positionId))
    .innerJoin(schema.baskets, eq(schema.baskets.id, schema.positions.basketId))
    .where(and(eq(schema.feeEvents.recipientAccount, pos.accountId), eq(schema.feeEvents.status, "success"), eq(schema.feeEvents.asset, USDC.intentsAssetId)));
  const orders = await db().select().from(schema.orders).where(eq(schema.orders.positionId, pos.id));
  const orderIds = orders.map((o) => o.id);
  const legs = orderIds.length ? await db().select().from(schema.orderLegs).where(inArray(schema.orderLegs.orderId, orderIds)) : [];
  const paid = orderIds.length
    ? await db()
        .select({ amount: schema.feeEvents.amount })
        .from(schema.feeEvents)
        .where(and(inArray(schema.feeEvents.orderId, orderIds), eq(schema.feeEvents.status, "success")))
    : [];
  const kindOf = new Map(orders.map((o) => [o.id, o.kind]));
  const ledger = buildLedger({
    usdc: USDC.intentsAssetId,
    fees: fees.map((f) => ({ at: f.at.toISOString(), amount: f.amount, from: f.basket })),
    topups: orders.filter((o) => o.kind === "buy" && o.grossUsdc).map((o) => ({ at: o.createdAt.toISOString(), grossUsdc: o.grossUsdc! })),
    feesPaid: paid,
    legs: legs.map((l) => ({
      at: l.updatedAt.toISOString(),
      orderKind: kindOf.get(l.orderId)!,
      seq: l.seq,
      assetFrom: l.assetFrom,
      assetTo: l.assetTo,
      amountIn: l.amountIn,
      amountOutActual: l.amountOutActual,
      recipient: l.recipient,
      status: l.status,
    })),
  });
  const usdcNow = shown.find((h) => h.assetId === "USDC")?.units ?? 0;

  return {
    owner: { handle: u.handle, address: u.walletAddress },
    basket: { slug: basket.slug, name: basket.name },
    accountId: pos.accountId,
    routeFees: t.routeFees,
    since: t.createdAt.toISOString(),
    // Who can move this money: the owner's keys on this account, plus the AI agent's if they opted in.
    spenders: { owner: true, agent: Boolean(pos.agentKeyAddedAt) },
    holdings: shown.map((h) => ({ ...h, weightNowBps: valueUsd > 0 ? Math.round((h.valueUsd / valueUsd) * 10_000) : 0 })),
    valueUsd,
    largest: concentration(shown.filter((h) => h.assetId !== "USDC")),
    ledger: ledger.entries.slice(0, 200),
    totals: { ...ledger.totals, cashNow: usdcNow, gap: usdcNow - ledger.totals.expectedCash },
  };
}

export type TreasuryPage = NonNullable<Awaited<ReturnType<typeof treasuryPage>>>;
