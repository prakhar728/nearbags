// Gifts (plan feature 2). A gift is a position of the sender's with a random key, bought like any bag. The link
// carries that key after the #. Claiming moves every balance into the claimer's own position for the same bag, in one
// transfer intent signed by the gift key and relayed by us after these checks. Taking it back is the same transfer to
// the sender's own position, signed by the gift key or by the sender's wallet (a recovery key on the gift account),
// and it also removes the gift's own key from the account, so the link stops working on intents.near itself.
// Until the sender takes it back, the link is like cash: expiry and region checks are nearbags' rules, and anyone
// holding the link could sign a transfer straight to intents.near.
import "server-only";
import { randomBytes } from "node:crypto";
import { and, desc, eq, gt, gte, inArray, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { getAsset } from "@/lib/assets";
import { HttpError } from "@/lib/auth/session";
import { getBasketById } from "@/lib/baskets";
import { eligibility } from "@/lib/compliance";
import { creatorName } from "@/lib/format";
import { visitorGeo } from "@/lib/geo";
import {
  addMoved,
  cancelProblem,
  claimProblem,
  fromStatuses,
  GIFT,
  giftCode,
  giftPublicKey,
  movedTokens,
  reclaimProblem,
  sameIntents,
  shownStatus,
  toStatus,
  transferAll,
  type TransferMode,
} from "@/lib/gift-rules";
import { isImplicitAccount } from "@/lib/intents/keys";
import { parsePayload, type Intent, type SignedRawEd25519 } from "@/lib/intents/payload";
import { balancesOf, hasPublicKey } from "@/lib/intents/rpc";
import { parseWalletSigned, walletSignerKey, type SignedErc191, type SignedNep413, type SignedIntent } from "@/lib/intents/wallet-sign";
import { oneclick } from "@/lib/oneclick";
import { livePrice } from "@/lib/prices/live";
import { relay, RelayerNotConfigured } from "@/lib/relayer";
import { spendRelay } from "@/lib/relay-budget";

type Gift = typeof schema.gifts.$inferSelect;

async function byCode(code: string): Promise<Gift> {
  const [g] = await db().select().from(schema.gifts).where(eq(schema.gifts.code, code));
  if (!g) throw new HttpError(404, "No such gift.");
  return g;
}

async function accountOf(g: Gift): Promise<string> {
  const [p] = await db().select({ accountId: schema.positions.accountId }).from(schema.positions).where(eq(schema.positions.id, g.positionId));
  return p.accountId;
}

/** The bag's assets plus USDC: everything a gift account can hold. */
async function giftTokens(basketId: number) {
  const basket = (await getBasketById(basketId))!;
  return [...new Set([...basket.assets.map((a) => a.assetId), "USDC"])].map(getAsset);
}

async function valueOf(accountId: string, basketId: number): Promise<number> {
  const assets = await giftTokens(basketId);
  const bals = await balancesOf(accountId, assets.map((a) => a.intentsAssetId));
  const values = await Promise.all(
    assets.map(async (a, i) => (BigInt(bals[i]) > 0n ? (Number(bals[i]) / 10 ** a.decimals) * ((await livePrice(a.id).catch(() => null))?.price ?? 0) : 0)),
  );
  return values.reduce((s, v) => s + v, 0);
}

/** Register a gift: the browser made a fresh key and sends only its account id. Paid for next, like any buy. */
export async function createGift(userId: number, p: { basketId: number; accountId: string; message: string | null; days: number }) {
  if (!isImplicitAccount(p.accountId)) throw new HttpError(400, "Malformed gift account.");
  const days = Math.round(p.days);
  if (days < GIFT.minDays || days > GIFT.maxDays) throw new HttpError(400, `A gift can last ${GIFT.minDays} to ${GIFT.maxDays} days.`);
  const message = p.message?.trim() || null;
  if (message && message.length > GIFT.messageMax) throw new HttpError(400, `Keep the message under ${GIFT.messageMax} characters.`);
  const basket = await getBasketById(p.basketId);
  if (!basket) throw new HttpError(404, "Basket not found.");
  if (basket.status !== "live") throw new HttpError(409, "Only live baskets can be gifted.");
  // Unpaid gifts cost nothing on-chain, but cap them so they don't pile up.
  const open = await db()
    .select({ id: schema.gifts.id })
    .from(schema.gifts)
    .where(and(eq(schema.gifts.senderUserId, userId), eq(schema.gifts.status, "funding"), gte(schema.gifts.createdAt, new Date(Date.now() - 86_400_000))));
  if (open.length >= 3) throw new HttpError(429, "You have three unpaid gifts from today. Finish one first (see your portfolio).");

  return db().transaction(async (tx) => {
    const [pos] = await tx.insert(schema.positions).values({ userId, basketId: basket.id, accountId: p.accountId, keyMode: "device", kind: "gift" }).returning();
    const [g] = await tx
      .insert(schema.gifts)
      .values({ code: giftCode((n) => randomBytes(n)), senderUserId: userId, positionId: pos.id, basketId: basket.id, message, expiresAt: new Date(Date.now() + days * 86_400_000) })
      .returning();
    await tx.insert(schema.auditLog).values({ actor: `user:${userId}`, action: "gift.create", target: g.code, details: { basketId: basket.id, days } });
    return { code: g.code, positionId: pos.id, accountId: pos.accountId };
  });
}

/**
 * The gift page: anyone with the link sees the bag, sender and message. The value only after signing in. The gift's
 * account id only for its sender: the claimer's browser derives it from the key in the link's #.
 */
export async function giftView(code: string, viewerUserId: number | null) {
  const g = await byCode(code);
  const basket = (await getBasketById(g.basketId))!;
  const [sender] = await db().select().from(schema.users).where(eq(schema.users.id, g.senderUserId));
  const accountId = await accountOf(g);
  const isSender = viewerUserId === g.senderUserId;
  return {
    code: g.code,
    status: shownStatus(g),
    expiresAt: g.expiresAt.toISOString(),
    message: g.message,
    sender: creatorName({ handle: sender.handle, address: sender.walletAddress }),
    isSender,
    basket: { id: basket.id, slug: basket.slug, name: basket.name, tagline: basket.tagline, agentManaged: Boolean(basket.agent), assets: basket.assets.map((a) => ({ assetId: a.assetId, weightBps: a.weightBps })) },
    accountId: isSender ? accountId : null,
    valueUsd: viewerUserId ? await valueOf(accountId, g.basketId).catch(() => null) : null,
  };
}

/**
 * Drop an unpaid gift (found in the round 1 test: each reload of the buy panel made a new one). Only when nothing
 * reached it: see cancelProblem. Its order is marked failed so the deposit address stops being offered.
 */
export async function cancelGift(code: string, userId: number) {
  const g = await byCode(code);
  const [o] = await db().select().from(schema.orders).where(eq(schema.orders.positionId, g.positionId)).orderBy(desc(schema.orders.createdAt)).limit(1);
  let depositSeen = false;
  if (o?.status === "awaiting_deposit" && o.fundingDepositAddress) {
    const st = await oneclick.status(o.fundingDepositAddress, o.fundingDepositMemo ?? undefined).catch(() => null);
    // Can't tell: be safe and treat it as on its way.
    depositSeen = !st || st.status !== "PENDING_DEPOSIT";
  }
  const accountId = await accountOf(g);
  const assets = await giftTokens(g.basketId);
  const holds = (await balancesOf(accountId, assets.map((a) => a.intentsAssetId))).some((b) => BigInt(b) > 0n);
  const why = cancelProblem(g, userId, { lastOrderStatus: o?.status ?? null, depositSeen, holds });
  if (why) throw new HttpError(409, why);
  await db().transaction(async (tx) => {
    // Only if it's still unpaid: a payment or a second tab may have moved it on since the checks above.
    const done = await tx
      .update(schema.gifts)
      .set({ status: "cancelled" })
      .where(and(eq(schema.gifts.id, g.id), eq(schema.gifts.status, "funding")))
      .returning({ id: schema.gifts.id });
    if (!done.length) throw new HttpError(409, "This gift changed while you were cancelling it. Refresh and look again.");
    if (o?.status === "awaiting_deposit") {
      const failed = await tx
        .update(schema.orders)
        .set({ status: "failed", error: "Gift cancelled before paying." })
        .where(and(eq(schema.orders.id, o.id), eq(schema.orders.status, "awaiting_deposit")))
        .returning({ id: schema.orders.id });
      if (!failed.length) throw new HttpError(409, "Its payment just arrived. Take the gift back instead.");
    }
    await tx.insert(schema.auditLog).values({ actor: `user:${userId}`, action: "gift.cancel", target: g.code, details: {} });
  });
  return { code: g.code, status: "cancelled" as const };
}

/** The sender's gifts, newest first, for their portfolio. */
export async function sentGifts(userId: number) {
  const rows = await db()
    .select({ g: schema.gifts, accountId: schema.positions.accountId, basket: schema.baskets.name, slug: schema.baskets.slug, agent: schema.baskets.agent })
    .from(schema.gifts)
    .innerJoin(schema.positions, eq(schema.positions.id, schema.gifts.positionId))
    .innerJoin(schema.baskets, eq(schema.baskets.id, schema.gifts.basketId))
    .where(eq(schema.gifts.senderUserId, userId))
    .orderBy(desc(schema.gifts.createdAt))
    .limit(50);
  const open = await Promise.all(
    rows.map(async (r) => {
      const [o] = await db()
        .select({ id: schema.orders.id, status: schema.orders.status })
        .from(schema.orders)
        .where(eq(schema.orders.positionId, r.g.positionId))
        .orderBy(desc(schema.orders.createdAt))
        .limit(1);
      return o ?? null;
    }),
  );
  return Promise.all(
    rows.map(async (r, i) => ({
      code: r.g.code,
      basketId: r.g.basketId,
      basket: r.basket,
      slug: r.slug,
      agentManaged: Boolean(r.agent),
      accountId: r.accountId,
      message: r.g.message,
      status: shownStatus(r.g),
      expiresAt: r.g.expiresAt.toISOString(),
      createdAt: r.g.createdAt.toISOString(),
      claimedAt: r.g.claimedAt?.toISOString() ?? null,
      lastOrder: open[i],
      // A gift taken back can still receive money later (a late deposit), so it keeps being checked.
      valueUsd: r.g.status === "claimed" ? 0 : await valueOf(r.accountId, r.g.basketId).catch(() => null),
    })),
  ).then((xs) => xs.filter((x) => x.status !== "cancelled" || (x.valueUsd ?? 0) > 0.01)); // a cancelled gift only matters if money arrived late
}

/**
 * Checks for a claim or take-back, and the exact intents to sign. The receiver is the user's own position for the bag.
 * A take-back also removes the gift's own key, while it is still there and the sender's wallet is a recovery key on
 * the account (without one, removing it would lock the account). `giftKeyLive` tells the sender's browser whether the
 * gift key can still sign, or the wallet must.
 */
export async function prepareTransfer(code: string, userId: number, mode: TransferMode, receiver: string) {
  const g = await byCode(code);
  if (mode === "claim") {
    const why = claimProblem(g, userId);
    if (why) throw new HttpError(409, why);
    const [u] = await db().select().from(schema.users).where(eq(schema.users.id, userId));
    const tokens = await giftTokens(g.basketId);
    const e = eligibility({ ...(await visitorGeo()), assetIds: tokens.map((a) => a.id).filter((id) => id !== "USDC"), attested: u.attestations });
    if (e.status === "blocked") throw new HttpError(451, e.reason ?? "This gift can't be claimed from your region. It stays with the sender.");
    if (e.status === "needs") throw new HttpError(409, "Accept the disclosures first.");
  } else {
    const why = reclaimProblem(g, userId);
    if (why) throw new HttpError(409, why);
  }
  const [own] = await db()
    .select()
    .from(schema.positions)
    .where(and(eq(schema.positions.userId, userId), eq(schema.positions.basketId, g.basketId), eq(schema.positions.kind, "own")));
  if (!own || own.accountId !== receiver) throw new HttpError(409, "Set up your own account for this bag first.");
  if (!own.recoveryKeyAddedAt) throw new HttpError(409, "Add your wallet as recovery key on your account first.");

  const accountId = await accountOf(g);
  const tokens = await giftTokens(g.basketId);
  const bals = await balancesOf(accountId, tokens.map((a) => a.intentsAssetId));
  let giftKeyLive = true;
  let removeKey: string | undefined;
  if (mode === "reclaim") {
    const giftKey = giftPublicKey(accountId);
    const [sender] = await db().select({ walletPubkey: schema.users.walletPubkey }).from(schema.users).where(eq(schema.users.id, g.senderUserId));
    const [live, walletOn] = await Promise.all([hasPublicKey(accountId, giftKey), sender.walletPubkey ? hasPublicKey(accountId, sender.walletPubkey) : Promise.resolve(false)]);
    giftKeyLive = live;
    if (live && walletOn) removeKey = giftKey;
  }
  let intents: Intent[];
  try {
    intents = transferAll(receiver, Object.fromEntries(tokens.map((a, i) => [a.intentsAssetId, bals[i]])), removeKey);
  } catch (e) {
    throw new HttpError(409, (e as Error).message);
  }
  return { gift: g, accountId, intents, giftKeyLive };
}

/** Relay a signed claim or take-back after checking it is exactly the transfer we'd build now. */
export async function submitTransfer(code: string, userId: number, mode: TransferMode, receiver: string, signed: SignedIntent) {
  const { gift, accountId, intents } = await prepareTransfer(code, userId, mode, receiver);
  let claim: { signer_id: string; intents: Intent[] };
  try {
    if (signed.standard === "raw_ed25519") claim = parsePayload(signed as SignedRawEd25519);
    else {
      // Only the sender's own wallet may sign a take-back: it is a recovery key on the gift account.
      if (mode !== "reclaim") throw new Error("Claims are signed with the gift's key.");
      claim = parseWalletSigned(signed as SignedErc191 | SignedNep413);
      const [u] = await db().select().from(schema.users).where(eq(schema.users.id, userId));
      if (!u.walletPubkey || (await walletSignerKey(signed as SignedErc191 | SignedNep413)) !== u.walletPubkey) throw new Error("Signed by a different wallet.");
    }
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }
  if (claim.signer_id !== accountId) throw new HttpError(403, "That isn't this gift's account.");
  if (!sameIntents(claim.intents, intents)) throw new HttpError(409, "The gift changed. Try again.");

  await spendRelay(userId);
  let txHash: string;
  try {
    ({ txHash } = await relay([signed]));
  } catch (e) {
    if (e instanceof RelayerNotConfigured) throw new HttpError(503, e.message);
    throw new HttpError(400, `The contract refused it: ${(e as Error).message.slice(0, 200)}`);
  }
  // What actually moved, from the intents we just relayed (they matched `intents` above).
  const moved = movedTokens(claim.intents);
  // Only from the status we checked: a claim and a take-back racing each other can't both be recorded. A second
  // take-back (money that landed later) adds to what the first moved, and must find the first one's tx unchanged.
  const again = mode === "reclaim" && gift.status === "reclaimed";
  const done = await db()
    .update(schema.gifts)
    .set({ status: toStatus(mode), claimedByUserId: userId, claimTx: txHash, claimedAt: new Date(), moved: again ? addMoved(gift.moved, moved) : moved })
    .where(
      and(
        eq(schema.gifts.id, gift.id),
        again
          ? and(eq(schema.gifts.status, "reclaimed"), gift.claimTx ? eq(schema.gifts.claimTx, gift.claimTx) : isNull(schema.gifts.claimTx))
          : and(inArray(schema.gifts.status, fromStatuses(mode)), mode === "claim" ? gt(schema.gifts.expiresAt, new Date()) : undefined),
      ),
    )
    .returning({ id: schema.gifts.id });
  await db()
    .insert(schema.auditLog)
    .values({ actor: `user:${userId}`, action: `gift.${mode}`, target: gift.code, details: { txHash, to: receiver, moved, recorded: done.length > 0 } });
  if (!done.length) throw new HttpError(409, `Someone else moved this gift at the same moment. Your transfer (${txHash}) went through; refresh to see where it stands.`);
  return { txHash, basketId: gift.basketId };
}
