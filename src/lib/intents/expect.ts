// What the browser checks before its basket key signs anything the server hands it (security audit 2026-11-18, #1).
// Pure, so it runs in the browser and in tests. The invariant: a basket account's money can only go
//   - back to the same account (a swap whose 1Click quote delivers into it, or a Rhea swap echoed back to it),
//   - to a payout or withdrawal address the user confirmed in this browser,
//   - or to fees, at most MAX_FEE_BPS of the USDC that is actually in the account.
// A compromised server, a bad deploy or a hostile 1Click payload can't get the key to sign anything else.
import { DCL_CONTRACT, allowedPools, tokenOf } from "@/lib/rhea-core";
import { USDC } from "@/lib/assets";
import { VERIFYING_CONTRACT, type Intent } from "./payload";

/** Creator fee cap (1%) plus the agent platform fee (0.5%), plus a little rounding room. */
export const MAX_FEE_BPS = 160;
/** 1Click payloads carry the quote's deadline (about 3 days out); refuse anything much longer-lived. */
const MAX_DEADLINE_MS = 4 * 86_400_000;

const isUint = (s: unknown): s is string => typeof s === "string" && /^\d+$/.test(s) && s.length < 60;

interface Parsed {
  signer_id: string;
  deadline: string;
  intents: Intent[];
}

export function parse(payload: string): Parsed | string {
  let j: Record<string, unknown>;
  try {
    j = JSON.parse(payload);
  } catch {
    return "the payload isn't JSON";
  }
  if (j.verifying_contract !== VERIFYING_CONTRACT) return "the payload is for another contract";
  if (typeof j.signer_id !== "string" || typeof j.deadline !== "string" || !Array.isArray(j.intents)) return "the payload is malformed";
  return { signer_id: j.signer_id, deadline: j.deadline, intents: j.intents as Intent[] };
}

/** Fee transfers: at most two, USDC only, to two different accounts, together at most MAX_FEE_BPS of `usdcInAccount`. */
export function checkFees(intents: Intent[], usdcInAccount: bigint): string | null {
  if (!Array.isArray(intents) || intents.length > 2) return "too many fee transfers";
  let total = 0n;
  const to = new Set<string>();
  for (const i of intents) {
    if (i.intent !== "transfer") return "a fee step isn't a plain transfer";
    const keys = Object.keys(i.tokens ?? {});
    if (keys.length !== 1 || keys[0] !== USDC.intentsAssetId) return "a fee isn't in USDC";
    const amt = i.tokens[keys[0]];
    if (!isUint(amt)) return "a fee amount is malformed";
    total += BigInt(amt);
    to.add(i.receiver_id);
  }
  if (to.size !== intents.length) return "two fees go to the same account";
  if (total * 10_000n > usdcInAccount * BigInt(MAX_FEE_BPS)) return "the fees are larger than this bag allows";
  return null;
}

export interface LegExpect {
  accountId: string;
  assetFrom: string;
  assetTo: string;
  /** The most this step may spend, smallest units. */
  maxIn: bigint;
  /** Where the output may go: null = back into the account; otherwise an address the user confirmed. */
  recipient: string | null;
  now?: number;
}

/** A 1Click step: one transfer of the input token to a deposit address. Returns the deposit and amount to look up. */
export function checkOneClickPayload(payload: string, e: LegExpect): { depositAddress: string; amount: string } | string {
  const p = parse(payload);
  if (typeof p === "string") return p;
  if (p.signer_id !== e.accountId) return "the swap is signed for another account";
  if (p.intents.length !== 1) return "the swap has more than one step";
  const i = p.intents[0] as Record<string, unknown>;
  if (i.intent !== "transfer") return "the swap isn't a transfer to 1Click";
  if (Object.keys(i).some((k) => !["intent", "receiver_id", "tokens", "memo"].includes(k))) return "the swap has unexpected fields";
  const tokens = i.tokens as Record<string, string>;
  const keys = Object.keys(tokens ?? {});
  if (keys.length !== 1 || keys[0] !== e.assetFrom) return "the swap spends the wrong token";
  if (!isUint(tokens[keys[0]]) || BigInt(tokens[keys[0]]) === 0n || BigInt(tokens[keys[0]]) > e.maxIn) return "the swap spends more than planned";
  const dl = Date.parse(p.deadline);
  if (!Number.isFinite(dl) || dl - (e.now ?? Date.now()) > MAX_DEADLINE_MS) return "the swap's deadline is too far away";
  if (typeof i.receiver_id !== "string" || !i.receiver_id) return "the swap has no receiver";
  return { depositAddress: i.receiver_id, amount: tokens[keys[0]] };
}

/** 1Click's own record of a deposit address (its public /v0/status), the part we check. */
export interface QuoteRecord {
  quoteResponse?: {
    quoteRequest?: Record<string, unknown>;
    quote?: { depositAddress?: string; amountIn?: string };
  };
}

/** The deposit address must belong to a 1Click quote that pays out where we expect and refunds to the account. */
export function checkQuoteRecord(rec: QuoteRecord, e: LegExpect & { depositAddress: string; amount: string }): string | null {
  const req = rec.quoteResponse?.quoteRequest;
  const q = rec.quoteResponse?.quote;
  if (!req || !q) return "1Click has no quote for this swap";
  if (q.depositAddress !== e.depositAddress) return "1Click's quote is for another deposit address";
  if (q.amountIn !== e.amount) return "1Click's quote is for a different amount";
  if (req.depositType !== "INTENTS" || req.originAsset !== e.assetFrom) return "1Click's quote spends a different token";
  if (req.destinationAsset !== e.assetTo) return "1Click's quote buys a different token";
  if (req.refundType !== "INTENTS" || req.refundTo !== e.accountId) return "1Click's quote refunds somewhere else";
  if (e.recipient === null) {
    if (req.recipientType !== "INTENTS" || req.recipient !== e.accountId) return "1Click's quote pays out to another account";
  } else if (req.recipient !== e.recipient) {
    return "1Click's quote pays out to an address you didn't confirm";
  }
  return null;
}

/** A Rhea step: a swap whose output comes back to the account, or a withdrawal to an address the user confirmed. */
export function checkRheaPayload(payload: string, e: LegExpect): string | null {
  const p = parse(payload);
  if (typeof p === "string") return p;
  if (p.signer_id !== e.accountId) return "the swap is signed for another account";
  if (p.intents.length !== 1) return "the swap has more than one step";
  const i = p.intents[0] as Record<string, unknown>;
  if (i.intent !== "ft_withdraw") return "the swap isn't a Rhea swap";
  if (!isUint(i.amount) || BigInt(i.amount) === 0n || BigInt(i.amount) > e.maxIn) return "the swap spends more than planned";
  let fromToken: string;
  try {
    fromToken = tokenOf(e.assetFrom);
  } catch {
    return "the swap spends an unknown token";
  }
  if (i.token !== fromToken) return "the swap spends the wrong token";
  if (e.recipient !== null) {
    if (i.receiver_id !== e.recipient || i.msg !== undefined) return "the withdrawal goes to an address you didn't confirm";
    return null;
  }
  if (i.receiver_id !== DCL_CONTRACT || typeof i.msg !== "string") return "the swap goes somewhere other than Rhea";
  let sw: Record<string, unknown>;
  try {
    sw = (JSON.parse(i.msg) as { Swap: Record<string, unknown> }).Swap;
  } catch {
    return "the Rhea swap message is malformed";
  }
  if (!sw || sw.client_echo !== e.accountId) return "the Rhea swap pays out to another account";
  if (sw.output_token !== tokenOf(e.assetTo)) return "the Rhea swap buys a different token";
  const pools = allowedPools();
  if (!Array.isArray(sw.pool_ids) || !sw.pool_ids.length || sw.pool_ids.some((x) => typeof x !== "string" || !pools.has(x))) return "the Rhea swap uses a pool we don't allow";
  return null;
}
