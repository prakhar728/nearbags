// Order engine (spec §5.4–5.6). Server side of buy and sell. The browser holds the basket key and signs; the server
// quotes, checks every signed payload against exactly what it expects, relays or submits, and tracks status.
//
// Buy:  awaiting_deposit → funded → fees_paid → legs_running → complete | partial   (or refunded / failed)
// Sell: fees_paid (= legs ready, no fees on sells) → legs_running → payout leg → complete | partial
import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { ASSETS, getAsset, USDC, withdrawTarget } from "@/lib/assets";
import { isNearAccountId, RheaNoLiquidity } from "@/lib/rhea";
import { minBuyUsd, RULES } from "@/lib/basket-rules";
import { getBasketById, platformFeeBpsFor, type BasketView } from "@/lib/baskets";
import { creatorFeeRecipient } from "@/lib/treasury";
import { revalidateBasket } from "@/lib/basket-pages";
import { eligibility } from "@/lib/compliance";
import { getSettings } from "@/lib/settings";
import type { Session } from "@/lib/auth/session";
import { HttpError } from "@/lib/auth/session";
import { parsePublicKey, bytesToHex } from "@/lib/intents/keys";
import { parsePayload, type Intent, type SignedRawEd25519 } from "@/lib/intents/payload";
import { balancesOf, hasPublicKey } from "@/lib/intents/rpc";
import { outsideBands } from "@/lib/agent/templates";
import { isFinal, oneclick, OneClickError, type QuoteResponse, type TokenInfo } from "@/lib/oneclick";
import { livePrice } from "@/lib/prices/live";
import { relay } from "@/lib/relayer";
import { withLease } from "@/lib/lease";
import { checkOneClickPayload } from "@/lib/intents/expect";
import { fundedAmount } from "./funding";
import { guard, usSession } from "./guard";
import { planLegs, preflightBuy, SLIPPAGE_BPS, splitFees } from "./preflight";
import { buyBlockReason, paused } from "./availability";
import { isRheaLeg, prepareRheaLeg, quoteRheaSell, rheaQuoteOf, setQuotedIf, settleRheaLeg, submitRheaLeg } from "./rhea-legs";

type Order = typeof schema.orders.$inferSelect;
type Leg = typeof schema.orderLegs.$inferSelect;
type Position = typeof schema.positions.$inferSelect;

export const PAYOUT_SEQ = 100;

// ---------- helpers ----------

export function platformFee(agent = false): { bps: number; account: string | null } {
  const account = process.env.PLATFORM_FEE_ACCOUNT?.trim() || null;
  return { bps: account ? platformFeeBpsFor(agent) : 0, account };
}

let tokenCache: { at: number; list: TokenInfo[] } | null = null;
export async function payTokens(): Promise<TokenInfo[]> {
  if (tokenCache && Date.now() - tokenCache.at < 5 * 60_000) return tokenCache.list;
  tokenCache = { at: Date.now(), list: await oneclick.tokens() };
  return tokenCache.list;
}

function toUnits(amount: number, decimals: number): string {
  // Avoid float overflow on 18-24 decimal tokens: scale in two steps.
  const head = Math.min(decimals, 12);
  return (BigInt(Math.floor(amount * 10 ** head)) * 10n ** BigInt(decimals - head)).toString();
}

async function loadOwned(orderId: number, userId: number): Promise<{ order: Order; position: Position }> {
  const [order] = await db().select().from(schema.orders).where(eq(schema.orders.id, orderId));
  if (!order) throw new HttpError(404, "Order not found.");
  const [position] = await db().select().from(schema.positions).where(eq(schema.positions.id, order.positionId));
  if (!position || position.userId !== userId) throw new HttpError(404, "Order not found.");
  return { order, position };
}

const legsOf = (orderId: number) => db().select().from(schema.orderLegs).where(eq(schema.orderLegs.orderId, orderId)).orderBy(asc(schema.orderLegs.seq));

async function setOrder(id: number, patch: Partial<Order>) {
  await db().update(schema.orders).set({ ...patch, updatedAt: new Date() }).where(eq(schema.orders.id, id));
}
/** Change an order only if it is still in `from` (another request may have moved it on). */
async function setOrderIf(id: number, from: Order["status"], patch: Partial<Order>) {
  await db().update(schema.orders).set({ ...patch, updatedAt: new Date() }).where(and(eq(schema.orders.id, id), eq(schema.orders.status, from)));
}
async function setLeg(id: number, patch: Partial<Leg>) {
  await db().update(schema.orderLegs).set({ ...patch, updatedAt: new Date() }).where(eq(schema.orderLegs.id, id));
}

/**
 * The signed payload must come from a key the basket account trusts: its own key (implicit account = hex of the
 * public key), or a device key the user's wallet authorized later (checked on-chain).
 */
async function assertSignedByAccount(signed: SignedRawEd25519, accountId: string) {
  const pk = parsePublicKey(signed.public_key);
  if (pk.curve !== "ed25519") throw new HttpError(403, "Signed by the wrong key.");
  if (bytesToHex(pk.bytes) !== accountId && !(await hasPublicKey(accountId, signed.public_key).catch(() => false))) {
    throw new HttpError(403, "This browser's key isn't authorized for this basket account.");
  }
  const claim = parsePayload(signed);
  if (claim.signer_id !== accountId) throw new HttpError(403, "Signed for the wrong account.");
  return claim;
}

// ---------- one open order per position (security audit 2026-11-18, #3 and #11) ----------

const OPEN_STATUSES = ["awaiting_deposit", "funded", "fees_paid", "legs_running"] as const;
const BUSY = "Another order on this bag is being set up. Try again in a moment.";

/**
 * An unpaid buy whose payment window closed (with nothing at 1Click) becomes failed, so it stops blocking the bag.
 * A deposit that still arrives later is refunded by 1Click. Returns true when it expired the order.
 */
async function expireIfUnpaid(order: Order): Promise<boolean> {
  if (order.kind !== "buy" || order.status !== "awaiting_deposit" || !order.fundingDepositAddress) return false;
  const q = order.fundingQuote as QuoteResponse | null;
  const deadline = Date.parse(q?.quote?.deadline ?? "") || order.createdAt.getTime() + 86_400_000;
  if (Date.now() < deadline + 15 * 60_000) return false;
  let st: Awaited<ReturnType<typeof oneclick.status>> | null = null;
  try {
    st = await oneclick.status(order.fundingDepositAddress, order.fundingDepositMemo ?? undefined);
  } catch (e) {
    if (!(e instanceof OneClickError && e.status === 404)) return false; // can't tell: leave it
  }
  if (st && st.status !== "PENDING_DEPOSIT") return false;
  const done = await db()
    .update(schema.orders)
    .set({ status: "failed", error: "The payment window closed before anything arrived.", updatedAt: new Date() })
    .where(and(eq(schema.orders.id, order.id), eq(schema.orders.status, "awaiting_deposit")))
    .returning({ id: schema.orders.id });
  return done.length > 0;
}

/** Refuse a new order while another one on the same position is still open. Call it holding the position's lease. */
async function assertNoOpenOrder(positionId: number) {
  const open = await db()
    .select()
    .from(schema.orders)
    .where(and(eq(schema.orders.positionId, positionId), inArray(schema.orders.status, [...OPEN_STATUSES])));
  for (const o of open) {
    if (await expireIfUnpaid(o)) continue;
    throw new HttpError(409, o.kind === "buy" && o.status === "awaiting_deposit" ? "This bag has an unpaid order. Pay it or cancel it first." : "Finish or cancel the open order on this bag first.");
  }
}

/**
 * Cancel an order that hasn't moved money yet: a buy still waiting for its payment, or a sell, rebalance or
 * withdrawal none of whose steps is being sent right now. Swaps that already finished stay in the bag (as USDC).
 */
export async function cancelOrder(s: Session, orderId: number) {
  const { order, position } = await loadOwned(orderId, s.userId);
  if (position.kind === "gift") throw new HttpError(409, "Cancel the gift instead (Portfolio, Gifts you sent).");
  return withLease(`position:${position.id}`, 60_000, BUSY, async () => {
    if (order.kind === "buy") {
      if (["complete", "partial", "failed", "refunded"].includes(order.status)) throw new HttpError(409, "This order has already finished.");
      if (order.status !== "awaiting_deposit") throw new HttpError(409, "This buy is already paid, so it can't be cancelled. It finishes on its own.");
      if (order.fundingDepositAddress) {
        let st: Awaited<ReturnType<typeof oneclick.status>> | null = null;
        try {
          st = await oneclick.status(order.fundingDepositAddress, order.fundingDepositMemo ?? undefined);
        } catch (e) {
          if (!(e instanceof OneClickError && e.status === 404)) throw new HttpError(503, "Couldn't check the payment with 1Click. Try again in a minute.");
        }
        if (st && st.status !== "PENDING_DEPOSIT") throw new HttpError(409, "Your payment has reached 1Click, so this buy can't be cancelled. It finishes on its own, or is refunded.");
      }
      const done = await db()
        .update(schema.orders)
        .set({ status: "failed", error: "Cancelled before paying.", updatedAt: new Date() })
        .where(and(eq(schema.orders.id, order.id), eq(schema.orders.status, "awaiting_deposit")))
        .returning({ id: schema.orders.id });
      if (!done.length) throw new HttpError(409, "This order just changed. Reload and look again.");
      return { cancelled: true };
    }
    if (!["fees_paid", "legs_running", "partial"].includes(order.status)) throw new HttpError(409, "This order has already finished.");
    const legs = await legsOf(order.id);
    const sending = legs.some((l) => l.status === "submitted" || (l.status === "quoted" && Date.now() - l.updatedAt.getTime() < 120_000));
    if (sending) throw new HttpError(409, "A swap in this order is being sent right now. Wait for it to finish, then cancel.");
    const done = await db()
      .update(schema.orders)
      .set({ status: "failed", error: "Cancelled. Anything already swapped stays in the bag.", updatedAt: new Date() })
      .where(and(eq(schema.orders.id, order.id), inArray(schema.orders.status, ["fees_paid", "legs_running", "partial"])))
      .returning({ id: schema.orders.id });
    if (!done.length) throw new HttpError(409, "This order just changed. Reload and look again.");
    return { cancelled: true };
  });
}

// ---------- buy ----------

export async function createBuyOrder(
  s: Session,
  p: { basketId: number; usd: number; payAssetId: string; refundAddress: string; giftCode?: string; agentKeyId?: number },
  geo: { country: string | null; region: string | null },
) {
  const basket = await getBasketById(p.basketId);
  if (!basket) throw new HttpError(404, "Basket not found.");
  const [buyer] = await db().select().from(schema.users).where(eq(schema.users.id, s.userId));
  const elig = eligibility({ ...geo, assetIds: basket.assets.map((a) => a.assetId), attested: buyer.attestations });
  if (elig.status === "blocked") throw new HttpError(451, elig.reason ?? "Not available in your region.");
  if (elig.status === "needs") throw new HttpError(409, "Accept the disclosures first.");
  const settings = await getSettings();
  if (settings.buysPaused) throw new HttpError(503, "Buying is paused for a moment. Selling still works.");
  const delisted = basket.assets.filter((a) => settings.delisted.includes(a.assetId)).map((a) => a.assetId);
  if (delisted.length) throw new HttpError(409, `${delisted.join(", ")} can't be bought right now. Holders can still sell.`);
  const blocked = buyBlockReason(await paused(basket.assets.map((a) => a.assetId)));
  if (blocked) throw new HttpError(409, blocked);
  const isCreator = basket.creator.id === s.userId;
  if (!(basket.status === "live" || (basket.status === "pending" && isCreator))) throw new HttpError(409, "This basket isn't open for buying.");

  // A gift is bought into its own account (the sender's until claimed); a normal buy into the buyer's own position.
  let position: Position | undefined;
  if (p.giftCode) {
    if (basket.status !== "live") throw new HttpError(409, "Only live baskets can be gifted.");
    const [g] = await db()
      .select()
      .from(schema.gifts)
      .where(and(eq(schema.gifts.code, p.giftCode), eq(schema.gifts.senderUserId, s.userId), eq(schema.gifts.basketId, basket.id)));
    if (!g || g.status !== "funding") throw new HttpError(409, "That gift can't take a payment now.");
    [position] = await db().select().from(schema.positions).where(eq(schema.positions.id, g.positionId));
  } else if (p.agentKeyId) {
    // An agent key buys into the account it holds the key for (registered through the MCP, owner's wallet as recovery).
    [position] = await db()
      .select()
      .from(schema.positions)
      .where(and(eq(schema.positions.userId, s.userId), eq(schema.positions.basketId, basket.id), eq(schema.positions.kind, "agent"), eq(schema.positions.agentKeyId, p.agentKeyId)));
  } else {
    [position] = await db()
      .select()
      .from(schema.positions)
      .where(and(eq(schema.positions.userId, s.userId), eq(schema.positions.basketId, basket.id), eq(schema.positions.kind, "own")));
  }
  if (!position) throw new HttpError(409, "Set up your basket account first.");
  if (!position.recoveryKeyAddedAt) throw new HttpError(409, "Add your wallet as recovery key first.");
  const pos = position;
  return withLease(`position:${pos.id}`, 90_000, BUSY, async () => {
  await assertNoOpenOrder(pos.id);
  const position = pos;

  const pf = platformFee(Boolean(basket.agent));
  const creatorBps = isCreator ? 0 : basket.feeBps;
  const min = minBuyUsd(basket.assets, basket.feeBps + pf.bps);
  if (p.usd < min) throw new HttpError(400, `This basket's minimum buy is $${min}.`);
  if (p.usd > RULES.maxBuyUsd) throw new HttpError(400, `The maximum buy is $${RULES.maxBuyUsd} for now.`);

  const pre = await preflightBuy({ weights: basket.assets, grossUsdc: BigInt(Math.floor(p.usd * 1e6)), creatorFeeBps: creatorBps, platformFeeBps: pf.bps, account: position.accountId });
  if (!pre.ok) throw new HttpError(409, pre.blockedBy.join(" "));

  const token = (await payTokens()).find((t) => t.assetId === p.payAssetId);
  if (!token) throw new HttpError(400, "That token isn't supported for paying.");
  const amount = toUnits(p.usd / token.price, token.decimals);

  let q: QuoteResponse;
  try {
    q = await oneclick.quote({
      dry: false,
      slippageTolerance: SLIPPAGE_BPS,
      originAsset: token.assetId,
      depositType: "ORIGIN_CHAIN",
      destinationAsset: USDC.intentsAssetId,
      amount,
      recipient: position.accountId,
      recipientType: "INTENTS",
      refundTo: p.refundAddress,
      refundType: "ORIGIN_CHAIN",
    }, 60);
  } catch (e) {
    throw new HttpError(400, `Couldn't get a deposit address: ${(e as Error).message.slice(0, 200)}`);
  }

  const [order] = await db()
    .insert(schema.orders)
    .values({
      positionId: position.id,
      kind: "buy",
      status: "awaiting_deposit",
      payAsset: token.assetId,
      payAmount: q.quote.amountIn,
      refundAddress: p.refundAddress,
      usdIn: p.usd,
      fundingDepositAddress: q.quote.depositAddress!,
      fundingDepositMemo: q.quote.depositMemo ?? null,
      fundingQuote: q as unknown as object,
    })
    .returning();
  return { order, preflight: pre };
  });
}

/** Called when the funding swap lands: decide fees and legs from the USDC that actually arrived. */
export async function markFunded(order: Order, position: Position, grossUsdc: bigint) {
  if (grossUsdc <= 0n) throw new Error(`Order ${order.id}: refusing to plan a buy from 0 USDC.`);
  const basket = (await getBasketById(position.basketId))!;
  const pf = platformFee(Boolean(basket.agent));
  const creatorBps = basket.creator.id === position.userId ? 0 : basket.feeBps;
  const fees = splitFees(grossUsdc, creatorBps, pf.bps);
  const plan = planLegs(fees.netUsdc, basket.assets);
  const legRows = plan.map((l, i) => {
      const a = getAsset(l.assetId);
      const stay = a.id === "USDC"; // USDC weight needs no swap
      return {
        orderId: order.id,
        seq: i,
        assetFrom: USDC.intentsAssetId,
        assetTo: a.intentsAssetId,
        amountIn: l.usdcIn,
        amountOutExpected: stay ? l.usdcIn : null,
        amountOutActual: stay ? l.usdcIn : null,
        status: stay ? ("success" as const) : ("pending" as const),
      };
  });
  const feeRows = [
    fees.creatorFee > 0n ? { orderId: order.id, recipientKind: "creator" as const, recipientAccount: await creatorFeeRecipient(basket.creator), asset: USDC.intentsAssetId, amount: fees.creatorFee.toString() } : null,
    fees.platformFee > 0n ? { orderId: order.id, recipientKind: "platform" as const, recipientAccount: pf.account!, asset: USDC.intentsAssetId, amount: fees.platformFee.toString() } : null,
  ].filter((x): x is NonNullable<typeof x> => x !== null);
  // Two tabs (or a tab and an agent) can see the deposit land at the same moment. Only the one that still finds the
  // order awaiting its deposit, with the row locked, writes the plan; the other does nothing. Everything above was
  // computed first, so the transaction holds one connection and does no other I/O.
  return db().transaction(async (tx) => {
    const [cur] = await tx.select({ status: schema.orders.status }).from(schema.orders).where(eq(schema.orders.id, order.id)).for("update");
    if (cur?.status !== "awaiting_deposit") return false;
    await tx.insert(schema.orderLegs).values(legRows);
    if (feeRows.length) await tx.insert(schema.feeEvents).values(feeRows);
    await tx
      .update(schema.orders)
      .set({ grossUsdc: grossUsdc.toString(), status: feeRows.length ? "funded" : "fees_paid", updatedAt: new Date() })
      .where(eq(schema.orders.id, order.id));
    return true;
  });
}

export async function expectedFeeIntents(orderId: number): Promise<Intent[]> {
  const fees = await db().select().from(schema.feeEvents).where(eq(schema.feeEvents.orderId, orderId)).orderBy(asc(schema.feeEvents.id));
  return fees.map((f) => ({ intent: "transfer", receiver_id: f.recipientAccount, tokens: { [f.asset]: f.amount } }));
}

export async function feeIntentsFor(s: Session, orderId: number) {
  const { order, position } = await loadOwned(orderId, s.userId);
  if (order.status !== "funded") throw new HttpError(409, "No fees to sign right now.");
  return { accountId: position.accountId, intents: await expectedFeeIntents(orderId) };
}

export async function submitFees(s: Session, orderId: number, signed: SignedRawEd25519) {
  // One fee payment per order: a second tab signing its own copy (a different nonce) would otherwise pay twice.
  return withLease(`fees:${orderId}`, 180_000, "This order's fees are being paid right now.", async () => {
    const { order, position } = await loadOwned(orderId, s.userId);
    if (order.status === "fees_paid" || order.status === "legs_running") return { already: true };
    if (order.status !== "funded") throw new HttpError(409, "No fees to pay right now.");
    const claim = await assertSignedByAccount(signed, position.accountId);
    const expected = await expectedFeeIntents(orderId);
    const norm = (xs: Intent[]) => JSON.stringify(xs.map((x) => (x.intent === "transfer" ? { r: x.receiver_id, t: x.tokens } : x)));
    if (norm(claim.intents) !== norm(expected)) throw new HttpError(403, "Fee transfer doesn't match this order.");
    // Nothing else spends from the account before its fees are paid, so a balance below what arrived means an earlier
    // attempt already paid them (its request died before it could record that). Record it instead of paying again.
    const [usdc] = await balancesOf(position.accountId, [USDC.intentsAssetId]);
    if (BigInt(usdc) < BigInt(order.grossUsdc ?? "0")) {
      await db().update(schema.feeEvents).set({ status: "success" }).where(eq(schema.feeEvents.orderId, orderId));
      await setOrder(orderId, { status: "fees_paid" });
      return { already: true };
    }
    const { txHash } = await relay([signed]);
    await db().update(schema.feeEvents).set({ status: "success", txHash }).where(eq(schema.feeEvents.orderId, orderId));
    await setOrder(orderId, { status: "fees_paid" });
    return { txHash };
  });
}

// ---------- legs (buy, sell and payout) ----------

/**
 * Fee on swaps the AI agent makes (rebalances), set as a 1Click app fee to the platform account. 1Click keeps half of
 * an app fee, so 20 here pays us 10 bps (0.1%); with 1Click's own 20 the quote's total is 30 bps, the signer's cap.
 */
export const AGENT_SWAP_APP_FEE_BPS = 20;

export async function prepareLeg(s: Session, orderId: number, seq: number, opts: { agent?: boolean } = {}) {
  const { order, position } = await loadOwned(orderId, s.userId);
  if (!["fees_paid", "legs_running", "partial"].includes(order.status)) throw new HttpError(409, "This order isn't ready for swaps.");
  const [leg] = (await legsOf(orderId)).filter((l) => l.seq === seq);
  if (!leg) throw new HttpError(404, "No such swap.");
  if (!["pending", "quoted", "refunded", "failed"].includes(leg.status)) throw new HttpError(409, `This swap is already ${leg.status}.`);
  if (leg.attempts >= 5) throw new HttpError(409, "Too many attempts on this swap. Try again later.");

  // A refunded swap returns its input to the account; never spend more than is there.
  const [bal] = await balancesOf(position.accountId, [leg.assetFrom]);
  const amountIn = BigInt(bal) < BigInt(leg.amountIn) ? bal : leg.amountIn;
  if (BigInt(amountIn) === 0n) {
    // Mark it failed so the order can finish (as partial) instead of waiting forever on a step that can't run.
    await setLeg(leg.id, { status: "failed", error: "Nothing left to swap for this step." });
    throw new HttpError(409, "Nothing left to swap for this leg.");
  }

  // Meme coins swap on Rhea (and leave Intents by a plain ft_withdraw): built here, signed in the browser, relayed by us.
  if (isRheaLeg(leg)) {
    const r = await prepareRheaLeg(leg, { accountId: position.accountId, amountIn, orderKind: order.kind });
    if (order.status !== "legs_running") await setOrder(order.id, { status: "legs_running" });
    return { seq, accountId: position.accountId, ...r };
  }

  const isPayout = leg.seq === PAYOUT_SEQ;
  const recipient = leg.recipient ?? (isPayout ? order.payoutAddress : null);
  let q: QuoteResponse;
  try {
    q = await oneclick.quote({
      dry: false,
      slippageTolerance: SLIPPAGE_BPS,
      originAsset: leg.assetFrom,
      depositType: "INTENTS",
      destinationAsset: leg.assetTo,
      amount: amountIn,
      recipient: recipient ?? position.accountId,
      recipientType: recipient ? "DESTINATION_CHAIN" : "INTENTS",
      refundTo: position.accountId,
      refundType: "INTENTS",
      ...(opts.agent && platformFee().account ? { appFees: [{ recipient: platformFee().account!, fee: AGENT_SWAP_APP_FEE_BPS }] } : {}),
    });
  } catch (e) {
    const msg = e instanceof OneClickError && e.noLiquidity ? "No liquidity for this swap right now." : (e as Error).message.slice(0, 200);
    await setLeg(leg.id, { error: msg, attempts: leg.attempts + 1 });
    throw new HttpError(409, msg);
  }

  // Price guard on USDC↔asset swaps. Not on payouts (user's chosen token) or withdrawals (same token out).
  let g = null;
  const side = leg.assetFrom === USDC.intentsAssetId ? "buy" : leg.assetTo === USDC.intentsAssetId ? "sell" : null;
  if (!isPayout && order.kind !== "withdraw" && side) {
    const assetId = side === "buy" ? leg.assetTo : leg.assetFrom;
    const a = ASSETS.find((x) => x.intentsAssetId === assetId)!;
    const ref = await livePrice(a.id);
    const usd = side === "buy" ? Number(amountIn) / 1e6 : Number(q.quote.amountOut) / 1e6;
    const units = side === "buy" ? Number(q.quote.amountOut) / 10 ** a.decimals : Number(amountIn) / 10 ** a.decimals;
    g = guard({ side, usd, units, referencePrice: ref.price, kind: a.kind, session: usSession() });
    if (g.verdict === "block") {
      await setLeg(leg.id, { error: "Price too far from market", guard: g as unknown as object, attempts: leg.attempts + 1 });
      throw new HttpError(409, `${a.id} is ${(g.deviation * 100).toFixed(1)}% off the market price right now. Try again in a few minutes.`);
    }
  }

  const gen = await oneclick.generateIntent(q.quote.depositAddress!, position.accountId, "raw_ed25519");
  const payload = typeof gen.intent.payload === "string" ? gen.intent.payload : JSON.stringify(gen.intent.payload);
  // Never store (and so never ask the browser to sign) anything but a single transfer of this step's input to this
  // quote's deposit address. The browser checks the same and more (lib/intents/expect.ts).
  const shape = checkOneClickPayload(payload, { accountId: position.accountId, assetFrom: leg.assetFrom, assetTo: leg.assetTo, maxIn: BigInt(amountIn), recipient: null });
  if (typeof shape === "string" || shape.depositAddress !== q.quote.depositAddress || shape.amount !== amountIn) {
    await setLeg(leg.id, { error: "1Click returned an unexpected payload", attempts: leg.attempts + 1 });
    console.error("unexpected 1Click payload", { leg: leg.id, why: typeof shape === "string" ? shape : "deposit or amount differ" });
    throw new HttpError(502, "1Click returned an unexpected swap. Nothing was signed. Try again.");
  }
  await setQuotedIf(leg, {
    amountIn,
    depositAddress: q.quote.depositAddress!,
    amountOutExpected: q.quote.amountOut,
    payload,
    quote: q as unknown as object,
    guard: g as unknown as object,
    error: null,
  });
  if (order.status !== "legs_running") await setOrder(order.id, { status: "legs_running" });
  return { seq, payload, accountId: position.accountId, expectedOut: q.quote.amountOutFormatted, guard: g };
}

export async function submitLeg(s: Session, orderId: number, seq: number, signed: SignedRawEd25519) {
  const { order, position } = await loadOwned(orderId, s.userId);
  if (!["fees_paid", "legs_running", "partial"].includes(order.status)) throw new HttpError(409, "This order isn't running.");
  const [leg] = (await legsOf(orderId)).filter((l) => l.seq === seq);
  if (!leg) throw new HttpError(404, "No such swap.");
  if (leg.status !== "quoted" || !leg.payload) throw new HttpError(409, "Get a fresh quote for this swap first.");
  await assertSignedByAccount(signed, position.accountId);
  if (signed.payload !== leg.payload) throw new HttpError(403, "Signed payload doesn't match the quote.");
  if (rheaQuoteOf(leg)) return submitRheaLeg(leg, signed, position.accountId);
  // Claim the step first, so a double submit (two tabs, a retry) can't send it twice.
  const claimed = await db()
    .update(schema.orderLegs)
    .set({ status: "submitted", updatedAt: new Date() })
    .where(and(eq(schema.orderLegs.id, leg.id), eq(schema.orderLegs.status, "quoted"), eq(schema.orderLegs.payload, leg.payload)))
    .returning({ id: schema.orderLegs.id });
  if (!claimed.length) throw new HttpError(409, "This swap was just sent from somewhere else.");
  try {
    const r = await oneclick.submitIntent(signed);
    await setLeg(leg.id, { intentHash: r.intentHash });
    return { intentHash: r.intentHash };
  } catch (e) {
    // A timeout or 5xx doesn't mean 1Click didn't take it. If the deposit shows up at 1Click, keep the step as sent
    // and let the status poll settle it; only a deposit 1Click never saw counts as failed (and can be retried).
    const st = await oneclick.status(leg.depositAddress!).catch(() => null);
    if (st && st.status !== "PENDING_DEPOSIT") return { intentHash: null };
    await setLeg(leg.id, { status: "failed", error: (e as Error).message.slice(0, 300) });
    throw new HttpError(400, `1Click refused the swap: ${(e as Error).message.slice(0, 200)}`);
  }
}

// ---------- sell ----------

export async function createSellOrder(s: Session, p: { positionId: number; pct: number; payoutAssetId: string; payoutAddress: string }) {
  if (![25, 50, 75, 100].includes(p.pct)) throw new HttpError(400, "Sell 25, 50, 75 or 100%.");
  const [position] = await db().select().from(schema.positions).where(eq(schema.positions.id, p.positionId));
  if (!position || position.userId !== s.userId) throw new HttpError(404, "Position not found.");
  const basket = (await getBasketById(position.basketId))!;
  return withLease(`position:${position.id}`, 180_000, BUSY, async () => {
  await assertNoOpenOrder(position.id);
  if (!(await payTokens()).some((t) => t.assetId === p.payoutAssetId)) throw new HttpError(400, "That payout token isn't supported.");

  const assets = [...new Set([...basket.assets.map((a) => getAsset(a.assetId)), USDC])];
  const bals = await balancesOf(position.accountId, assets.map((a) => a.intentsAssetId));
  const legs: { assetFrom: string; amountIn: string; asset: ReturnType<typeof getAsset> }[] = [];
  let usdcStart = 0n;
  assets.forEach((a, i) => {
    const amt = (BigInt(bals[i]) * BigInt(p.pct)) / 100n;
    if (amt === 0n) return;
    if (a.id === "USDC") usdcStart = amt;
    else legs.push({ assetFrom: a.intentsAssetId, amountIn: amt.toString(), asset: a });
  });
  if (!legs.length && usdcStart === 0n) throw new HttpError(409, "Nothing to sell in this basket.");

  // Preflight: every sell leg must quote now and pass the guard.
  const session = usSession();
  const problems: string[] = [];
  for (const l of legs) {
    if (l.asset.venue === "rhea") {
      try {
        const { guard: g } = await quoteRheaSell(l.asset.id, l.amountIn);
        if (g.verdict === "block") problems.push(`${l.asset.id} would sell ${(g.deviation * 100).toFixed(1)}% below its pool price right now (thin liquidity). Try a smaller percentage.`);
      } catch (e) {
        problems.push(e instanceof RheaNoLiquidity ? e.message : `${l.asset.id}: ${(e as Error).message.slice(0, 120)}`);
      }
      continue;
    }
    try {
      const [q, ref] = await Promise.all([
        oneclick.quote({ dry: true, slippageTolerance: SLIPPAGE_BPS, originAsset: l.assetFrom, depositType: "INTENTS", destinationAsset: USDC.intentsAssetId, amount: l.amountIn, recipient: position.accountId, recipientType: "INTENTS", refundTo: position.accountId, refundType: "INTENTS" }),
        livePrice(l.asset.id),
      ]);
      const g = guard({ side: "sell", usd: Number(q.quote.amountOut) / 1e6, units: Number(l.amountIn) / 10 ** l.asset.decimals, referencePrice: ref.price, kind: l.asset.kind, session });
      if (g.verdict === "block") problems.push(`${l.asset.id} would sell ${(g.deviation * 100).toFixed(1)}% below the market price right now.`);
    } catch (e) {
      const below = e instanceof OneClickError && e.noLiquidity && l.asset.minLegUsd > 0 && p.pct < 100;
      problems.push(
        below
          ? `${l.asset.id}: ${p.pct}% of your holding may be under its $${l.asset.minLegUsd} minimum swap. Try a bigger percentage.`
          : e instanceof OneClickError && e.noLiquidity
            ? `${l.asset.id} isn't tradable right now.`
            : `${l.asset.id}: ${(e as Error).message.slice(0, 120)}`,
      );
    }
  }
  if (problems.length) throw new HttpError(409, problems.join(" "));

  const [order] = await db()
    .insert(schema.orders)
    .values({ positionId: position.id, kind: "sell", status: "fees_paid", sellPct: p.pct, payAsset: p.payoutAssetId, payoutAddress: p.payoutAddress, usdcStart: usdcStart.toString() })
    .returning();
  if (legs.length) {
    await db().insert(schema.orderLegs).values(legs.map((l, i) => ({ orderId: order.id, seq: i, assetFrom: l.assetFrom, assetTo: USDC.intentsAssetId, amountIn: l.amountIn })));
  }
  await maybeCreatePayout(order);
  return { order };
  });
}

async function maybeCreatePayout(order: Order) {
  const legs = await legsOf(order.id);
  if (legs.some((l) => l.seq === PAYOUT_SEQ)) return;
  const swaps = legs.filter((l) => l.seq !== PAYOUT_SEQ);
  if (!swaps.every((l) => isLegFinal(l.status))) return;
  const proceeds = swaps.filter((l) => l.status === "success").reduce((sum, l) => sum + BigInt(l.amountOutActual ?? "0"), 0n);
  const total = proceeds + BigInt(order.usdcStart ?? "0");
  if (total === 0n) return;
  await db().insert(schema.orderLegs).values({ orderId: order.id, seq: PAYOUT_SEQ, assetFrom: USDC.intentsAssetId, assetTo: order.payAsset!, amountIn: total.toString() }).onConflictDoNothing();
}

/** A leg the browser should (re)run now: never started, or quoted but not submitted for over a minute. */
const legReady = (l: Leg) => l.status === "pending" || (l.status === "quoted" && Date.now() - l.updatedAt.getTime() > 60_000);

const isLegFinal = (st: Leg["status"]) => st === "success" || st === "refunded" || st === "failed";

// ---------- reset to target weights (spec §5.7) ----------

export const RESET_BUY_SEQ = 200;

/** `onlyIfOutsideBands`: template baskets trade a holder only once some asset drifts past its band. */
export async function createResetOrder(s: Session, positionId: number, opts: { onlyIfOutsideBands?: boolean } = {}) {
  const owned = await ownedIdlePosition(s, positionId);
  return withLease(`position:${owned.id}`, 180_000, BUSY, async () => {
  await assertNoOpenOrder(owned.id);
  const position = owned;
  const basket = (await getBasketById(position.basketId))!;
  const assets = basket.assets.map((w) => ({ w, a: getAsset(w.assetId) }));
  const bals = await balancesOf(position.accountId, assets.map(({ a }) => a.intentsAssetId));
  const prices = await Promise.all(assets.map(({ a }) => livePrice(a.id).then((p) => p.price)));
  const values = assets.map((_, i) => (Number(bals[i]) / 10 ** assets[i].a.decimals) * prices[i]);
  // Idle USDC (left by an earlier swap) counts toward the basket's value when USDC isn't one of its assets.
  const idleUsdc = assets.some(({ a }) => a.id === "USDC") ? 0 : Number((await balancesOf(position.accountId, [USDC.intentsAssetId]))[0]) / 1e6;
  const total = values.reduce((x, y) => x + y, 0) + idleUsdc;
  if (total < 1) throw new HttpError(409, "Nothing in this basket to rebalance.");
  if (opts.onlyIfOutsideBands) {
    const rows = assets.map(({ w, a }, i) => ({ weightBps: (values[i] / total) * 10_000, targetBps: w.weightBps, minLegUsd: a.minLegUsd }));
    if (!outsideBands(rows, total)) throw new HttpError(409, "Every asset is inside its band, so no trade was needed.");
  }

  const sells = assets
    .map(({ w, a }, i) => ({ a, excessUsd: values[i] - (total * w.weightBps) / 10_000, i }))
    .filter((x) => x.a.id !== "USDC" && x.excessUsd >= x.a.minLegUsd);
  const underweight = assets.some(({ w, a }, i) => a.id !== "USDC" && (total * w.weightBps) / 10_000 - values[i] >= a.minLegUsd);
  if (!sells.length && !underweight) throw new HttpError(409, "Already close to target. Each swap would be below its minimum size.");

  const [order] = await db().insert(schema.orders).values({ positionId: position.id, kind: "reset", status: "fees_paid" }).returning();
  if (sells.length) {
    await db().insert(schema.orderLegs).values(
      sells.map((x, k) => {
        const units = BigInt(Math.floor((x.excessUsd / prices[x.i]) * 10 ** Math.min(x.a.decimals, 12))) * 10n ** BigInt(Math.max(0, x.a.decimals - 12));
        const amt = units > BigInt(bals[x.i]) ? BigInt(bals[x.i]) : units;
        return { orderId: order.id, seq: k, assetFrom: x.a.intentsAssetId, assetTo: USDC.intentsAssetId, amountIn: amt.toString() };
      }),
    );
  }
  await maybeCreateResetBuys(order);
  return { order };
  });
}

/** After the sells settle, spend the account's USDC on the assets that are under target. */
async function maybeCreateResetBuys(order: Order) {
  const legs = await legsOf(order.id);
  if (legs.some((l) => l.seq >= RESET_BUY_SEQ) || !legs.every((l) => isLegFinal(l.status))) return;
  const [position] = await db().select().from(schema.positions).where(eq(schema.positions.id, order.positionId));
  const basket = (await getBasketById(position.basketId))!;
  const assets = basket.assets.map((w) => ({ w, a: getAsset(w.assetId) }));
  const bals = await balancesOf(position.accountId, assets.map(({ a }) => a.intentsAssetId));
  const prices = await Promise.all(assets.map(({ a }) => livePrice(a.id).then((p) => p.price)));
  const values = assets.map((_, i) => (Number(bals[i]) / 10 ** assets[i].a.decimals) * prices[i]);
  const usdcIdx = assets.findIndex(({ a }) => a.id === "USDC");
  const [usdcBal] = await balancesOf(position.accountId, [USDC.intentsAssetId]);
  // The sells just turned part of the basket into USDC. When USDC isn't one of the basket's assets, that cash is
  // still part of the basket's value, or every target comes out too small and the buys fall under their minimums.
  const total = values.reduce((x, y) => x + y, 0) + (usdcIdx >= 0 ? 0 : Number(usdcBal) / 1e6);
  const usdcTarget = usdcIdx >= 0 ? (total * assets[usdcIdx].w.weightBps) / 10_000 : 0;
  let spendable = Math.max(0, Number(usdcBal) / 1e6 - usdcTarget);
  const deficits = assets
    .map(({ w, a }, i) => ({ a, need: (total * w.weightBps) / 10_000 - values[i] }))
    .filter((x) => x.a.id !== "USDC" && x.need >= x.a.minLegUsd)
    .sort((x, y) => y.need - x.need);
  const rows = [];
  for (const [k, d] of deficits.entries()) {
    const spend = Math.min(d.need, spendable);
    if (spend < d.a.minLegUsd) continue;
    spendable -= spend;
    rows.push({ orderId: order.id, seq: RESET_BUY_SEQ + k, assetFrom: USDC.intentsAssetId, assetTo: d.a.intentsAssetId, amountIn: String(Math.floor(spend * 1e6)) });
  }
  if (rows.length) await db().insert(schema.orderLegs).values(rows).onConflictDoNothing();
  else if (!legs.length) await setOrder(order.id, { status: "complete" });
}

// ---------- withdraw as tokens (spec §5.6) ----------

export async function createWithdrawOrder(s: Session, p: { positionId: number; addresses: Record<string, string> }) {
  const owned = await ownedIdlePosition(s, p.positionId);
  return withLease(`position:${owned.id}`, 120_000, BUSY, async () => {
  await assertNoOpenOrder(owned.id);
  const position = owned;
  const basket = (await getBasketById(position.basketId))!;
  const assets = [...new Set([...basket.assets.map((w) => w.assetId), "USDC"])].map(getAsset);
  const bals = await balancesOf(position.accountId, assets.map((a) => a.intentsAssetId));
  const rows = [];
  for (const [i, a] of assets.entries()) {
    if (BigInt(bals[i]) === 0n) continue;
    const t = withdrawTarget(a);
    const to = p.addresses[t.chain]?.trim();
    if (!to) throw new HttpError(400, `Add your ${t.chain.toUpperCase()} address to receive ${a.id}.`);
    if (a.venue === "rhea" && !isNearAccountId(to)) throw new HttpError(400, `${a.id} goes to a NEAR account: ${to} isn't one.`);
    rows.push({ orderId: 0, seq: rows.length, assetFrom: a.intentsAssetId, assetTo: t.assetId, amountIn: bals[i], recipient: to });
  }
  if (!rows.length) throw new HttpError(409, "Nothing to withdraw.");
  const [order] = await db().insert(schema.orders).values({ positionId: position.id, kind: "withdraw", status: "fees_paid" }).returning();
  await db().insert(schema.orderLegs).values(rows.map((r) => ({ ...r, orderId: order.id })));
  return { order };
  });
}

/** Which chains need an address to withdraw this position (for the form). */
export async function withdrawChains(s: Session, positionId: number) {
  const [position] = await db().select().from(schema.positions).where(eq(schema.positions.id, positionId));
  if (!position || position.userId !== s.userId) throw new HttpError(404, "Position not found.");
  const basket = (await getBasketById(position.basketId))!;
  const assets = [...new Set([...basket.assets.map((w) => w.assetId), "USDC"])].map(getAsset);
  const bals = await balancesOf(position.accountId, assets.map((a) => a.intentsAssetId));
  const out: Record<string, string[]> = {};
  assets.forEach((a, i) => {
    if (BigInt(bals[i]) === 0n) return;
    const c = withdrawTarget(a).chain;
    (out[c] ??= []).push(a.id);
  });
  return out;
}

async function ownedIdlePosition(s: Session, positionId: number): Promise<Position> {
  const [position] = await db().select().from(schema.positions).where(eq(schema.positions.id, positionId));
  if (!position || position.userId !== s.userId) throw new HttpError(404, "Position not found.");
  return position; // the caller checks for open orders while holding the position's lease
}

// ---------- refresh + view ----------

export type NextStep = "deposit" | "sign_fees" | "run_legs" | "wait" | "done";

export async function refreshOrder(s: Session, orderId: number) {
  const owned = await loadOwned(orderId, s.userId);
  let order = owned.order;
  const position = owned.position;

  // Repair: a buy marked funded with 0 USDC (its balance was read before the deposit showed up) took no fees and
  // planned 0-USDC swaps that can never run. If none of them started, forget the plan and read the deposit again.
  if (order.kind === "buy" && order.status === "fees_paid" && order.grossUsdc === "0") {
    const legs = await legsOf(order.id);
    if (legs.every((l) => l.status === "pending" && l.attempts === 0 && !l.payload)) {
      await db().transaction(async (tx) => {
        const [cur] = await tx.select({ status: schema.orders.status, gross: schema.orders.grossUsdc }).from(schema.orders).where(eq(schema.orders.id, order.id)).for("update");
        if (cur?.status !== "fees_paid" || cur.gross !== "0") return;
        await tx.delete(schema.orderLegs).where(eq(schema.orderLegs.orderId, order.id));
        await tx.update(schema.orders).set({ status: "awaiting_deposit", grossUsdc: null, updatedAt: new Date() }).where(eq(schema.orders.id, order.id));
      });
      [order] = await db().select().from(schema.orders).where(eq(schema.orders.id, orderId));
    }
  }

  if (await expireIfUnpaid(order)) [order] = await db().select().from(schema.orders).where(eq(schema.orders.id, orderId));
  if (order.status === "awaiting_deposit" && order.fundingDepositAddress) {
    try {
      const st = await oneclick.status(order.fundingDepositAddress, order.fundingDepositMemo ?? undefined);
      if (st.status === "SUCCESS") {
        const reported = BigInt(st.swapDetails?.amountOut ?? "0");
        const [onchain] = await balancesOf(position.accountId, [USDC.intentsAssetId]);
        const gross = fundedAmount(reported, BigInt(onchain), order.createdAt);
        if (gross > 0n) await markFunded(order, position, gross);
        // else: the RPC hasn't caught up with 1Click yet; the next poll tries again.
      } else if (st.status === "REFUNDED") await setOrderIf(order.id, "awaiting_deposit", { status: "refunded" });
      else if (st.status === "FAILED") await setOrderIf(order.id, "awaiting_deposit", { status: "failed", error: "The deposit swap failed." });
    } catch (e) {
      if (!(e instanceof OneClickError && e.status === 404)) console.error("funding status", e);
    }
  }

  for (const leg of await legsOf(order.id)) {
    if (leg.status === "submitted" && rheaQuoteOf(leg)) {
      await settleRheaLeg(leg, position.accountId).catch((e) => console.error("rhea leg settle", e));
      continue;
    }
    if (leg.status !== "submitted" || !leg.depositAddress) continue;
    try {
      const st = await oneclick.status(leg.depositAddress);
      if (!isFinal(st.status)) continue;
      await setLeg(leg.id, {
        status: st.status === "SUCCESS" ? "success" : st.status === "REFUNDED" ? "refunded" : "failed",
        amountOutActual: st.swapDetails?.amountOut ?? null,
      });
    } catch (e) {
      if (!(e instanceof OneClickError && e.status === 404)) console.error("leg status", e);
    }
  }

  [order] = await db().select().from(schema.orders).where(eq(schema.orders.id, orderId));
  if (order.kind === "sell") await maybeCreatePayout(order);
  if (order.kind === "reset") await maybeCreateResetBuys(order);

  const legs = await legsOf(order.id);
  if (["fees_paid", "legs_running", "partial"].includes(order.status) && legs.length && legs.every((l) => isLegFinal(l.status))) {
    const done = order.kind === "sell" ? legs.some((l) => l.seq === PAYOUT_SEQ) : order.kind === "reset" ? legs.some((l) => l.seq >= RESET_BUY_SEQ) || !(await legsOf(order.id)).length : true;
    if (done) {
      const allOk = legs.every((l) => l.status === "success");
      const payout = legs.find((l) => l.seq === PAYOUT_SEQ);
      await setOrder(order.id, {
        status: allOk ? "complete" : "partial",
        ...(order.kind === "sell" && payout?.status === "success" ? { usdOut: Number(payout.amountIn) / 1e6 } : {}),
      });
      if (allOk && order.kind === "buy") await maybeGoLive(position);
      // A gift is ready to claim once anything landed in it (a partial buy still holds most of the bag).
      if (order.kind === "buy" && position.kind === "gift")
        await db().update(schema.gifts).set({ status: "ready" }).where(and(eq(schema.gifts.positionId, position.id), eq(schema.gifts.status, "funding")));
    }
  }
  return orderView(orderId);
}

/** A pending basket goes live when its creator's own buy completes at or above the minimum (spec Q13). */
async function maybeGoLive(position: Position) {
  if (position.kind !== "own") return;
  const basket = await getBasketById(position.basketId);
  if (basket?.status === "pending" && basket.creator.id === position.userId) {
    await db().update(schema.baskets).set({ status: "live", publishedAt: new Date() }).where(eq(schema.baskets.id, basket.id));
    revalidateBasket(basket.slug);
  }
}

export async function orderView(orderId: number) {
  const [order] = await db().select().from(schema.orders).where(eq(schema.orders.id, orderId));
  const legs = await legsOf(orderId);
  const fees = await db().select().from(schema.feeEvents).where(eq(schema.feeEvents.orderId, orderId));
  const [position] = await db().select().from(schema.positions).where(eq(schema.positions.id, order.positionId));
  const next: NextStep =
    order.status === "awaiting_deposit"
      ? "deposit"
      : order.status === "funded"
        ? "sign_fees"
        : ["complete", "refunded", "failed"].includes(order.status)
          ? "done"
          : legs.some(legReady)
            ? "run_legs"
            : order.status === "partial"
              ? "done"
              : "wait";
  const q = order.fundingQuote as QuoteResponse | null;
  return {
    order: {
      id: order.id,
      kind: order.kind,
      status: order.status,
      basketId: position.basketId,
      accountId: position.accountId,
      usdIn: order.usdIn,
      grossUsdc: order.grossUsdc,
      sellPct: order.sellPct,
      payAsset: order.payAsset,
      payoutAddress: order.payoutAddress,
      error: order.error,
      createdAt: order.createdAt,
      deposit:
        order.kind === "buy" && q
          ? {
              address: order.fundingDepositAddress,
              memo: order.fundingDepositMemo,
              amountIn: q.quote.amountIn,
              amountInFormatted: q.quote.amountInFormatted,
              deadline: q.quote.deadline,
              timeEstimate: q.quote.timeEstimate,
            }
          : null,
    },
    legs: legs.map((l) => ({
      seq: l.seq,
      assetFrom: l.assetFrom,
      assetTo: l.assetTo,
      amountIn: l.amountIn,
      amountOutExpected: l.amountOutExpected,
      amountOutActual: l.amountOutActual,
      status: l.status,
      error: l.error,
      attempts: l.attempts,
      isPayout: l.seq === PAYOUT_SEQ,
      recipient: l.recipient,
      venue: isRheaLeg(l) ? ("rhea" as const) : ("oneclick" as const),
      txHash: rheaQuoteOf(l)?.txHash ?? null,
      ready: legReady(l),
    })),
    fees: fees.map((f) => ({ kind: f.recipientKind, account: f.recipientAccount, amount: f.amount, status: f.status, txHash: f.txHash })),
    next,
  };
}

export type OrderView = Awaited<ReturnType<typeof orderView>>;
export type { BasketView };
