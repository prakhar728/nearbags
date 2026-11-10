// Rhea legs in the order engine: meme-coin swaps (USDC ↔ meme, one DCL multi-hop through wNEAR) and meme-coin
// withdrawals to a NEAR account. Same shape as a 1Click leg: the server builds the exact payload, the browser signs it
// with the basket key, the server checks it against an allowlist and relays it (our relayer pays gas).
//
// Differences from 1Click legs: no deposit address and no /status. Settlement comes from the relayed transaction
// itself (we wait for FINAL, so Rhea's swap and the echo back into intents.near have run), with a balance check as
// the fallback.
import "server-only";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { assetByIntentsId, getAsset, type Asset } from "@/lib/assets";
import { HttpError } from "@/lib/auth/session";
import { buildPayload, parsePayload, type SignedRawEd25519 } from "@/lib/intents/payload";
import { balancesOf } from "@/lib/intents/rpc";
import { livePrice } from "@/lib/prices/live";
import { relay, relayerAccountId } from "@/lib/relayer";
import {
  checkSwapPayload,
  checkWithdrawPayload,
  disagreementProblem,
  isNearAccountId,
  minOutput,
  quoteLeg,
  RHEA_DEADLINE_MS,
  RheaNoLiquidity,
  storageRegistered,
  swapIntent,
  swapSettlement,
  tokenOf,
  tokenSafety,
  txReceipts,
  withdrawIntent,
  withdrawSettlement,
  type Settlement,
  type SwapSpec,
} from "@/lib/rhea";
import { guard, usSession, type GuardResult } from "./guard";

type Leg = typeof schema.orderLegs.$inferSelect;

/** What a Rhea leg keeps in order_legs.quote. */
export interface RheaLegQuote {
  venue: "rhea";
  kind: "swap" | "withdraw";
  spec?: SwapSpec; // swap
  withdraw?: { account: string; token: string; receiver: string; amount: string }; // withdraw
  quoteOut?: string; // DCL quote at prepare time
  midUsd?: number; // reference price used by the guard
  preBalance?: string; // output token balance just before relaying (fallback settlement)
  txHash?: string;
  relayedAt?: number;
}

export const rheaQuoteOf = (l: Leg): RheaLegQuote | null => ((l.quote as RheaLegQuote | null)?.venue === "rhea" ? (l.quote as RheaLegQuote) : null);

/** Does this leg run on Rhea? Any leg touching a Rhea asset (payouts are always USDC → a 1Click token, so never). */
export function isRheaLeg(l: Pick<Leg, "assetFrom" | "assetTo">): boolean {
  return assetByIntentsId(l.assetFrom)?.venue === "rhea" || assetByIntentsId(l.assetTo)?.venue === "rhea";
}

async function setLeg(id: number, patch: Partial<Leg>) {
  await db().update(schema.orderLegs).set({ ...patch, updatedAt: new Date() }).where(eq(schema.orderLegs.id, id));
}

const memeOf = (from: Asset, to: Asset) => (from.rhea ? from : to);

// ---------- prepare ----------

export async function prepareRheaLeg(leg: Leg, ctx: { accountId: string; amountIn: string; orderKind: string }) {
  const from = assetByIntentsId(leg.assetFrom);
  const to = assetByIntentsId(leg.assetTo);
  if (!from || !to) throw new HttpError(409, "This swap's assets aren't on the approved list.");
  if (leg.recipient) return prepareRheaWithdraw(leg, from, ctx);

  const meme = memeOf(from, to);
  const side = from.id === "USDC" ? "buy" : to.id === "USDC" ? "sell" : null;
  if (side === "buy") {
    // An upgradable meme coin must still be the contract we checked. Sells stay open regardless: holders can always exit.
    const safety = await tokenSafety(meme.id);
    if (!safety.ok) {
      await setLeg(leg.id, { error: safety.reason ?? "paused", attempts: leg.attempts + 1 });
      throw new HttpError(409, `Buying ${meme.id} is paused: ${safety.reason}`);
    }
  }

  let q;
  try {
    q = await quoteLeg(from.id, to.id, ctx.amountIn);
  } catch (e) {
    const msg = e instanceof RheaNoLiquidity ? e.message : `Rhea couldn't quote this swap: ${(e as Error).message.slice(0, 160)}`;
    await setLeg(leg.id, { error: msg, attempts: leg.attempts + 1 });
    throw new HttpError(409, msg);
  }

  let g: GuardResult | null = null;
  let midUsd: number | undefined;
  if (side) {
    const ref = await livePrice(meme.id);
    midUsd = ref.price;
    const jumped = side === "buy" ? disagreementProblem(meme.id, ref.disagreement) : null;
    if (jumped) {
      await setLeg(leg.id, { error: jumped, attempts: leg.attempts + 1 });
      throw new HttpError(409, jumped);
    }
    const usd = side === "buy" ? Number(ctx.amountIn) / 1e6 : Number(q.amountOut) / 1e6;
    const units = side === "buy" ? Number(q.amountOut) / 10 ** meme.decimals : Number(ctx.amountIn) / 10 ** meme.decimals;
    g = guard({ side, usd, units, referencePrice: midUsd, kind: meme.kind, session: usSession() });
    if (g.verdict === "block") {
      await setLeg(leg.id, { error: "Price too far from the pool price", guard: g as unknown as object, attempts: leg.attempts + 1 });
      throw new HttpError(409, `${meme.id} is ${(g.deviation * 100).toFixed(1)}% off its pool price right now (thin liquidity). Try again in a few minutes or with less.`);
    }
  }

  const spec: SwapSpec = {
    account: ctx.accountId,
    token: q.inputToken,
    amount: ctx.amountIn,
    poolIds: q.poolIds,
    outputToken: q.outputToken,
    minOut: minOutput(BigInt(q.amountOut)).toString(),
  };
  const payload = buildPayload(ctx.accountId, [swapIntent(spec)], { deadlineMs: RHEA_DEADLINE_MS });
  const quote: RheaLegQuote = { venue: "rhea", kind: "swap", spec, quoteOut: q.amountOut, midUsd };
  await setLeg(leg.id, {
    amountIn: ctx.amountIn,
    depositAddress: null,
    amountOutExpected: q.amountOut,
    payload,
    quote: quote as unknown as object,
    guard: g as unknown as object,
    status: "quoted",
    error: null,
    attempts: leg.attempts + 1,
  });
  const out = Number(q.amountOut) / 10 ** to.decimals;
  return { payload, expectedOut: out.toLocaleString("en-US", { maximumFractionDigits: to.decimals > 6 ? 2 : 6 }), guard: g };
}

async function prepareRheaWithdraw(leg: Leg, asset: Asset, ctx: { accountId: string; amountIn: string }) {
  const receiver = leg.recipient!;
  const token = tokenOf(asset.intentsAssetId);
  if (!isNearAccountId(receiver)) throw new HttpError(400, `${receiver} isn't a NEAR account id.`);
  // A plain ft_transfer to an account that isn't registered on the token fails, and intents.near credits it back.
  // Catch that up front with a clear next step instead.
  if (!(await storageRegistered(token, receiver).catch(() => false))) {
    const msg = `${receiver} can't receive ${asset.id} yet (not registered on the token). Register it once from a NEAR wallet, or sell ${asset.id} for USDC instead.`;
    await setLeg(leg.id, { error: msg, attempts: leg.attempts + 1 });
    throw new HttpError(409, msg);
  }
  const withdraw = { account: ctx.accountId, token, receiver, amount: ctx.amountIn };
  const payload = buildPayload(ctx.accountId, [withdrawIntent(withdraw)], { deadlineMs: RHEA_DEADLINE_MS });
  const quote: RheaLegQuote = { venue: "rhea", kind: "withdraw", withdraw };
  await setLeg(leg.id, { amountIn: ctx.amountIn, depositAddress: null, amountOutExpected: ctx.amountIn, payload, quote: quote as unknown as object, status: "quoted", error: null, attempts: leg.attempts + 1 });
  return { payload, expectedOut: (Number(ctx.amountIn) / 10 ** asset.decimals).toLocaleString("en-US", { maximumFractionDigits: 2 }), guard: null };
}

// ---------- submit (relay) ----------

export async function submitRheaLeg(leg: Leg, signed: SignedRawEd25519, accountId: string) {
  const q = rheaQuoteOf(leg);
  if (!q) throw new HttpError(409, "Get a fresh quote for this swap first.");
  const claim = parsePayload(signed);
  // Defense in depth: the signed payload already equals the one we built, but never relay anything that isn't
  // exactly an allowlisted Rhea swap (or a plain withdrawal) for this leg.
  const why =
    q.kind === "swap"
      ? checkSwapPayload(claim, { ...q.spec!, account: accountId, token: tokenOf(leg.assetFrom), amount: leg.amountIn, outputToken: tokenOf(leg.assetTo) })
      : checkWithdrawPayload(claim, { account: accountId, token: tokenOf(leg.assetFrom), receiver: leg.recipient ?? "", amount: leg.amountIn });
  if (why) throw new HttpError(403, `Refused to relay this swap: ${why}.`);
  if (Date.parse(claim.deadline) < Date.now() + 5_000) throw new HttpError(409, "This quote expired. Get a fresh one.");

  // Claim the leg so a double click can't relay twice (intents.near would also reject the reused nonce).
  const claimed = await db()
    .update(schema.orderLegs)
    .set({ status: "submitted", updatedAt: new Date() })
    .where(and(eq(schema.orderLegs.id, leg.id), eq(schema.orderLegs.status, "quoted")))
    .returning({ id: schema.orderLegs.id });
  if (!claimed.length) throw new HttpError(409, "This swap was already sent.");

  const preBalance = q.kind === "swap" ? await balancesOf(accountId, [leg.assetTo]).then(([b]) => b).catch(() => undefined) : undefined;
  let r;
  try {
    r = await relay([signed]);
  } catch (e) {
    // Simulation or execution refused it: nothing moved. The leg can be retried with a fresh quote.
    const msg = (e as Error).message.slice(0, 300);
    await setLeg(leg.id, { status: "failed", error: `Rhea swap not sent: ${msg}` });
    throw new HttpError(400, `The swap couldn't be sent: ${msg.slice(0, 200)}`);
  }
  const next: RheaLegQuote = { ...q, preBalance, txHash: r.txHash, relayedAt: Date.now() };
  const intentHash = r.simulation.intents_executed?.[0]?.intent_hash ?? null;
  const st = q.kind === "swap" ? swapSettlement(r.receipts, accountId, leg.assetFrom, leg.assetTo) : withdrawSettlement(r.receipts, accountId, leg.assetFrom);
  await applySettlement(leg, st, next, intentHash);
  return { intentHash, txHash: r.txHash, outcome: st.outcome };
}

async function applySettlement(leg: Leg, st: Settlement, q: RheaLegQuote, intentHash?: string | null) {
  const base = { quote: q as unknown as object, ...(intentHash ? { intentHash } : {}) };
  if (st.outcome === "success") await setLeg(leg.id, { ...base, status: "success", amountOutActual: st.amountOut, error: null });
  else if (st.outcome === "refunded")
    await setLeg(leg.id, {
      ...base,
      status: "refunded",
      error: q.kind === "swap" ? "Rhea couldn't fill at the minimum price, so nothing was swapped. The funds are back in the basket account." : "The NEAR account didn't accept the tokens. They are back in the basket account.",
    });
  else await setLeg(leg.id, base); // stays "submitted": refreshOrder looks again
}

// ---------- settle (refresh) ----------

const SETTLE_GRACE_MS = 2 * 60_000;

/** A submitted Rhea leg whose outcome we haven't read yet: read the tx again, then fall back to the balance. */
export async function settleRheaLeg(leg: Leg, accountId: string) {
  const q = rheaQuoteOf(leg);
  if (!q) return;
  const age = Date.now() - (q.relayedAt ?? leg.updatedAt.getTime());
  if (!q.txHash) {
    // Claimed but never relayed (the server died mid-request). The payload's deadline has long passed by then.
    if (age > 10 * 60_000) await setLeg(leg.id, { status: "failed", error: "The swap was never sent. Retry it." });
    return;
  }
  const sender = relayerAccountId();
  const receipts = sender ? await txReceipts(q.txHash, sender) : null;
  if (receipts) {
    const st = q.kind === "swap" ? swapSettlement(receipts, accountId, leg.assetFrom, leg.assetTo) : withdrawSettlement(receipts, accountId, leg.assetFrom);
    if (st.outcome !== "unknown") return applySettlement(leg, st, q);
  }
  if (age < SETTLE_GRACE_MS) return;
  if (q.kind === "swap" && q.preBalance != null && q.spec) {
    const [now] = await balancesOf(accountId, [leg.assetTo]);
    const diff = BigInt(now) - BigInt(q.preBalance);
    if (diff >= BigInt(q.spec.minOut)) return setLeg(leg.id, { status: "success", amountOutActual: diff.toString(), error: null });
  }
  await setLeg(leg.id, {
    status: "failed",
    error: `No tokens came back from Rhea for this ${q.kind} (tx ${q.txHash}). Check the basket's balances; if the input left the account, contact support with the tx.`,
  });
}

// ---------- sell preflight and exit value ----------

/** Dry sell of `amount` of a meme coin for USDC: the USDC it would pay, and the guard against the pool mid. */
export async function quoteRheaSell(assetId: string, amount: string): Promise<{ usdcOut: string; guard: GuardResult }> {
  const a = getAsset(assetId);
  const [q, ref] = await Promise.all([quoteLeg(a.id, "USDC", amount), livePrice(a.id)]);
  const g = guard({ side: "sell", usd: Number(q.amountOut) / 1e6, units: Number(amount) / 10 ** a.decimals, referencePrice: ref.price, kind: a.kind, session: usSession() });
  return { usdcOut: q.amountOut, guard: g };
}
