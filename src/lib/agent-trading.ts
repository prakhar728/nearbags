// Agent keys that buy and sell (plan feature 5). The agent makes and holds its own ed25519 key; its account is a
// position of the key's owner (kind "agent") with the owner's wallet added as recovery key before the first buy, so
// the owner can take over (unless the agent removes it again). nearbags never sees the agent's key: we hand it exact
// intents or payloads, it signs them locally and sends them back, and we check them as we do for the website.
//
// Limits: trading is off until the owner turns it on; only chosen bags (or any); buys count against a daily USD limit
// ($100 by default, at most $1,000) and at most 20 an hour; a few sells a day; sales we build pay the owner's wallet.
// These are our server's rules, not the chain's: the agent holds its account's full key, so it can move what's in it
// on intents.near without us (withdraw included). Owners should fund an agent only with money they'd hand it outright.
import "server-only";
import { and, eq, gte, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import type { AgentActor } from "@/lib/agent-keys";
import { AGENT_TRADE, cleanSettings, limitProblem, openOrderProblem, payoutChainOk, tradeProblem, type TradeSettings } from "@/lib/agent-trading-rules";
import { HttpError, type Session } from "@/lib/auth/session";
import { getBasketBySlug } from "@/lib/baskets";
import { isImplicitAccount } from "@/lib/intents/keys";
import { parsePayload, type Intent, type SignedRawEd25519 } from "@/lib/intents/payload";
import { hasPublicKey } from "@/lib/intents/rpc";
import { withLease } from "@/lib/lease";
import { CREATOR_CONTENT_NOTE } from "@/lib/mcp/untrusted";
import { cap } from "@/lib/ratelimit";
import { relay, RelayerNotConfigured } from "@/lib/relayer";
import { signatureProblem } from "@/lib/intents/proof";
import { spendRelay } from "@/lib/relay-budget";
import {
  createBuyOrder,
  createSellOrder,
  expectedFeeIntents,
  payTokens,
  prepareLeg,
  refreshOrder,
  submitFees,
  submitLeg,
} from "@/lib/trade/orders";
import { audit } from "@/lib/agent-keys";

type KeyRow = typeof schema.agentKeys.$inferSelect;
type Position = typeof schema.positions.$inferSelect;

const settingsOf = (k: KeyRow): TradeSettings => ({ enabled: k.tradeEnabled, dailyUsd: k.tradeDailyUsd, anyBag: k.tradeAnyBag, basketIds: k.tradeBasketIds });
/** The owner's session, for the shared order code. Every call below first checks the order is this key's. */
const ownerSession = (a: AgentActor): Session => ({ userId: a.user.id, chain: a.user.walletChain, address: a.user.walletAddress });

async function keyRow(a: AgentActor): Promise<KeyRow> {
  const [k] = await db().select().from(schema.agentKeys).where(eq(schema.agentKeys.id, a.keyId));
  return k;
}

async function tradableBasket(a: AgentActor, slug: string) {
  const b = await getBasketBySlug(slug);
  if (!b || b.status !== "live") throw new HttpError(404, `No live bag "${slug}".`);
  const why = tradeProblem(settingsOf(await keyRow(a)), b.id);
  if (why) throw new HttpError(403, why);
  return b;
}

async function agentPosition(a: AgentActor, basketId: number): Promise<Position | null> {
  const [p] = await db()
    .select()
    .from(schema.positions)
    .where(and(eq(schema.positions.agentKeyId, a.keyId), eq(schema.positions.basketId, basketId), eq(schema.positions.kind, "agent")));
  return p ?? null;
}

/** The order, only if it belongs to one of this key's accounts. */
async function ownOrder(a: AgentActor, orderId: number) {
  const [row] = await db()
    .select({ o: schema.orders, p: schema.positions })
    .from(schema.orders)
    .innerJoin(schema.positions, eq(schema.positions.id, schema.orders.positionId))
    .where(eq(schema.orders.id, orderId));
  if (!row || row.p.kind !== "agent" || row.p.agentKeyId !== a.keyId) throw new HttpError(404, "No such order for this key.");
  return row;
}

/** The order, only if this key may still move it on: trading off or the bag dropped stops it (see openOrderProblem). */
async function movableOrder(a: AgentActor, orderId: number) {
  const row = await ownOrder(a, orderId);
  const legs = await db().select({ status: schema.orderLegs.status }).from(schema.orderLegs).where(eq(schema.orderLegs.orderId, orderId));
  const why = openOrderProblem(settingsOf(await keyRow(a)), row.p.basketId, { kind: row.o.kind, status: row.o.status, legStatuses: legs.map((l) => l.status) });
  if (why) throw new HttpError(403, why);
  return row;
}

/** Our own messages (HttpError) go to the agent; anything else is logged and stays generic. */
function agentError(e: unknown, where: string): string {
  if (e instanceof HttpError) return e.message;
  console.error(`[agent-trading] ${where}`, e);
  return "Something went wrong at nearbags. Try again shortly.";
}

// ---------- owner settings (profile) ----------

export async function setTrading(userId: number, keyId: number, input: { enabled: boolean; dailyUsd: number; anyBag: boolean; basketIds: number[] }) {
  let t: TradeSettings;
  try {
    t = cleanSettings(input);
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }
  const [row] = await db()
    .update(schema.agentKeys)
    .set({ tradeEnabled: t.enabled, tradeDailyUsd: t.dailyUsd, tradeAnyBag: t.anyBag, tradeBasketIds: t.basketIds })
    .where(and(eq(schema.agentKeys.id, keyId), eq(schema.agentKeys.userId, userId)))
    .returning();
  if (!row) throw new HttpError(404, "No such key.");
  await db().insert(schema.auditLog).values({ actor: `user:${userId}`, action: "agent_key.trading", target: row.prefix, details: t as unknown as object });
  return settingsOf(row);
}

// ---------- MCP: accounts ----------

/**
 * Register the agent's account for a bag. The first call (no `signed`) records it and returns the one intent the
 * agent must sign: adding the owner's wallet as recovery key. The second call relays that signed intent.
 */
export async function openAccount(a: AgentActor, slug: string, accountId: string, signed?: SignedRawEd25519) {
  const b = await tradableBasket(a, slug);
  if (!isImplicitAccount(accountId)) throw new HttpError(400, "account_id must be the 64-character hex of your ed25519 public key.");
  if (!a.user.walletPubkey) throw new HttpError(409, "The key's owner has no wallet key on file. They need to sign in on nearbags again.");
  let pos = await agentPosition(a, b.id);
  if (pos && pos.accountId !== accountId) throw new HttpError(409, "This key already has a different account for this bag.");
  const intents: Intent[] = [{ intent: "add_public_key", public_key: a.user.walletPubkey }];
  if (!pos) {
    // Record the account only once the agent proves it holds its key (re-audit N4): the signed recovery-key intent is
    // that proof. Until then just say what to sign, so nobody can register someone else's account under a bag.
    if (!signed) return { slug, accountId, ready: false, signThis: { signer_id: accountId, intents } };
    const why = signatureProblem(signed, accountId);
    if (why) throw new HttpError(403, `That isn't signed by this account's key (${why}).`);
    const [taken] = await db().select({ id: schema.positions.id }).from(schema.positions).where(eq(schema.positions.accountId, accountId));
    if (taken) throw new HttpError(409, "That account is already registered on nearbags.");
    [pos] = await db()
      .insert(schema.positions)
      .values({ userId: a.user.id, basketId: b.id, accountId, keyMode: "device", kind: "agent", agentKeyId: a.keyId })
      .returning();
    await audit(a.user, a.prefix, "mcp.open_account", slug, { accountId });
  }
  if (pos.recoveryKeyAddedAt) return { slug, accountId, ready: true };
  if (await hasPublicKey(accountId, a.user.walletPubkey)) {
    await db().update(schema.positions).set({ recoveryKeyAddedAt: new Date() }).where(eq(schema.positions.id, pos.id));
    return { slug, accountId, ready: true };
  }
  if (!signed) return { slug, accountId, ready: false, signThis: { signer_id: accountId, intents } };

  let claim;
  try {
    claim = parsePayload(signed);
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }
  if (claim.signer_id !== accountId || JSON.stringify(claim.intents) !== JSON.stringify(intents)) {
    throw new HttpError(403, "Only adding the owner's wallet as recovery key is allowed here.");
  }
  await spendRelay(a.user.id);
  try {
    const { txHash } = await relay([signed]);
    await db().update(schema.positions).set({ recoveryKeyAddedAt: new Date() }).where(eq(schema.positions.id, pos.id));
    await audit(a.user, a.prefix, "mcp.recovery_key", accountId, { txHash });
    return { slug, accountId, ready: true, txHash };
  } catch (e) {
    if (e instanceof RelayerNotConfigured) throw new HttpError(503, e.message);
    throw new HttpError(400, `The contract refused it: ${(e as Error).message.slice(0, 200)}`);
  }
}

// ---------- MCP: buy and sell ----------

async function boughtTodayUsd(keyId: number): Promise<number> {
  const rows = await db()
    .select({ usd: schema.orders.usdIn, status: schema.orders.status })
    .from(schema.orders)
    .innerJoin(schema.positions, eq(schema.positions.id, schema.orders.positionId))
    .where(and(eq(schema.positions.agentKeyId, keyId), eq(schema.orders.kind, "buy"), gte(schema.orders.createdAt, new Date(Date.now() - 86_400_000))));
  // An order that never got its deposit doesn't count once it's dead; everything else does.
  return rows.filter((r) => !["failed", "refunded"].includes(r.status)).reduce((s, r) => s + (r.usd ?? 0), 0);
}

export async function buy(a: AgentActor, p: { slug: string; usd: number; payAssetId: string; refundAddress: string }) {
  const b = await tradableBasket(a, p.slug);
  const pos = await agentPosition(a, b.id);
  if (!pos?.recoveryKeyAddedAt) throw new HttpError(409, "Open your account for this bag first (open_account).");
  // Each buy asks 1Click for a quote and a deposit address: a hard cap per key, on top of the daily dollar limit.
  await cap(`agent-buy:${a.keyId}`, AGENT_TRADE.buysPerHour, 3600_000, `At most ${AGENT_TRADE.buysPerHour} buys an hour per key. Try again later.`);
  // One buy per key at a time, so parallel calls can't each read "$0 spent today" before any order is written.
  const order = await withLease(`agent-buy:${a.keyId}`, 60_000, "Another buy for this key is still being set up. Try again in a few seconds.", async () => {
    const why = limitProblem(settingsOf(await keyRow(a)), await boughtTodayUsd(a.keyId), p.usd);
    if (why) throw new HttpError(403, why);
    // The owner's attestations apply; the agent's own location isn't the owner's, so country checks use theirs on the site.
    const { order } = await createBuyOrder(ownerSession(a), { basketId: b.id, usd: p.usd, payAssetId: p.payAssetId, refundAddress: p.refundAddress, agentKeyId: a.keyId }, { country: null, region: null });
    return order;
  });
  await audit(a.user, a.prefix, "mcp.buy", p.slug, { orderId: order.id, usd: p.usd });
  return next(a, order.id);
}

export async function sell(a: AgentActor, p: { slug: string; pct: number; payoutAssetId: string }) {
  const b = await tradableBasket(a, p.slug);
  const pos = await agentPosition(a, b.id);
  if (!pos) throw new HttpError(404, "This key holds nothing in that bag.");
  const token = (await payTokens()).find((t) => t.assetId === p.payoutAssetId);
  if (!token) throw new HttpError(400, "That payout token isn't supported.");
  if (!payoutChainOk(a.user.walletChain, token.blockchain)) {
    throw new HttpError(400, `nearbags sends sale money to the owner's wallet (${a.user.walletAddress}), so pick a payout token on ${a.user.walletChain === "near" ? "NEAR" : "an EVM chain"}.`);
  }
  const sellsToday = await db()
    .select({ id: schema.orders.id })
    .from(schema.orders)
    .where(and(eq(schema.orders.positionId, pos.id), eq(schema.orders.kind, "sell"), gte(schema.orders.createdAt, new Date(Date.now() - 86_400_000))));
  if (sellsToday.length >= AGENT_TRADE.sellsPerDay) throw new HttpError(429, `At most ${AGENT_TRADE.sellsPerDay} sells a day per bag.`);
  const { order } = await createSellOrder(ownerSession(a), { positionId: pos.id, pct: p.pct, payoutAssetId: p.payoutAssetId, payoutAddress: a.user.walletAddress });
  await audit(a.user, a.prefix, "mcp.sell", p.slug, { orderId: order.id, pct: p.pct });
  return next(a, order.id);
}

/**
 * Advance an order and say what the agent must do next: pay the deposit, sign the fees, sign swap payloads, wait,
 * or nothing (done). Payloads are exact strings to sign as they are (ed25519 over the UTF-8 bytes).
 */
export async function next(a: AgentActor, orderId: number) {
  await movableOrder(a, orderId);
  const s = ownerSession(a);
  const v = await refreshOrder(s, orderId);
  const base = { orderId, kind: v.order.kind, status: v.order.status, accountId: v.order.accountId };
  switch (v.next) {
    case "deposit":
      return {
        ...base,
        next: "pay",
        pay: { to: v.order.deposit?.address, memo: v.order.deposit?.memo ?? null, amount: v.order.deposit?.amountIn, amountFormatted: v.order.deposit?.amountInFormatted, token: v.order.payAsset, deadline: v.order.deposit?.deadline },
        note: "Send exactly this from your own wallet, then call order_next again in a minute.",
      };
    case "sign_fees":
      return { ...base, next: "sign_intents", signer_id: v.order.accountId, intents: await expectedFeeIntents(orderId), note: "Build a raw_ed25519 payload with these intents, sign it, and send it with order_sign (fees)." };
    case "run_legs": {
      const ready = v.legs.filter((l) => l.ready).slice(0, 5);
      const payloads = [];
      for (const l of ready) {
        try {
          const r = await prepareLeg(s, orderId, l.seq, { agent: false });
          payloads.push({ seq: l.seq, payload: r.payload });
        } catch (e) {
          payloads.push({ seq: l.seq, error: agentError(e, `prepare order ${orderId} leg ${l.seq}`) });
        }
      }
      return { ...base, next: "sign_payloads", payloads, note: "Sign each payload string exactly as given and send them with order_sign (legs)." };
    }
    case "done":
      return { ...base, next: "done", legs: v.legs.map((l) => ({ seq: l.seq, status: l.status, error: l.error })) };
    default:
      return { ...base, next: "wait", note: "Swaps are settling. Call order_next again in 20 to 30 seconds." };
  }
}

export async function sign(a: AgentActor, p: { orderId: number; fees?: SignedRawEd25519; legs?: { seq: number; signed: SignedRawEd25519 }[] }) {
  await movableOrder(a, p.orderId);
  const s = ownerSession(a);
  const out: Record<string, unknown> = {};
  if (p.fees) out.fees = await submitFees(s, p.orderId, p.fees);
  for (const l of p.legs ?? []) {
    try {
      out[`leg${l.seq}`] = await submitLeg(s, p.orderId, l.seq, l.signed);
    } catch (e) {
      out[`leg${l.seq}`] = { error: agentError(e, `submit order ${p.orderId} leg ${l.seq}`) };
    }
  }
  return next(a, p.orderId).then((n) => ({ submitted: out, ...n }));
}

/** This key's accounts and their open orders. */
export async function myAccounts(a: AgentActor) {
  const k = await keyRow(a);
  const rows = await db()
    .select({ p: schema.positions, slug: schema.baskets.slug, name: schema.baskets.name })
    .from(schema.positions)
    .innerJoin(schema.baskets, eq(schema.baskets.id, schema.positions.basketId))
    .where(and(eq(schema.positions.agentKeyId, a.keyId), eq(schema.positions.kind, "agent")));
  const orders = rows.length
    ? await db().select().from(schema.orders).where(inArray(schema.orders.positionId, rows.map((r) => r.p.id)))
    : [];
  return {
    trading: { ...settingsOf(k), boughtLast24hUsd: await boughtTodayUsd(a.keyId) },
    payoutWallet: a.user.walletAddress,
    creatorContentNote: CREATOR_CONTENT_NOTE,
    accounts: rows.map((r) => ({
      slug: r.slug,
      creatorContent: { name: r.name },
      accountId: r.p.accountId,
      recoveryKeyAdded: Boolean(r.p.recoveryKeyAddedAt),
      openOrders: orders.filter((o) => o.positionId === r.p.id && !["complete", "partial", "failed", "refunded"].includes(o.status)).map((o) => ({ id: o.id, kind: o.kind, status: o.status })),
    })),
  };
}
