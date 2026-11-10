// Rhea (Ref) DCL legs for meme coins: the pure parts (routes, the intent we ask the basket key to sign, the allowlist
// the server checks before relaying, settlement from the relayed tx's logs, and pool price math). No I/O, so it is
// unit-tested; the chain calls are in rhea.ts.
//
// How a leg works (verified on mainnet, research 2026-11-10/11): the basket account signs ONE intent, an ft_withdraw of
// the input token to dclv2.ref-labs.near with a DCL "Swap" msg whose client_echo is the basket account itself.
// intents.near ft_transfer_call's the token to Rhea, Rhea swaps along pool_ids, then ft_transfer_call's the output
// back to intents.near with msg = client_echo, which credits the basket account. intents.near is on Rhea's
// client_echo and secure_sender whitelists. If min_output_amount isn't met, Rhea panics and intents.near re-credits
// the input (ft_resolve_withdraw).
import { ASSETS, getAsset, USDC, type Asset } from "@/lib/assets";
import type { Intent } from "@/lib/intents/payload";

export const DCL_CONTRACT = "dclv2.ref-labs.near";
export const INTENTS_CONTRACT = "intents.near";
export const WNEAR = "wrap.near";
export const USDC_TOKEN = USDC.intentsAssetId.replace(/^nep141:/, "");
/** USDC/wNEAR at 0.01%: ~$200k a side, so this hop costs ~nothing. */
export const USDC_WNEAR_POOL = `${USDC_TOKEN}|${WNEAR}|100`;
/** min_output_amount = fresh DCL quote × (1 − 2%). */
export const RHEA_SLIPPAGE_BPS = 200;
/** Gas floor for the ft_transfer_call to Rhea (what the observed mainnet echo swaps use); leftover gas goes to it too. */
export const RHEA_MIN_GAS = "150000000000000";
/** A signed Rhea leg is good for 2 minutes; the quote it was built from is older than that by then. */
export const RHEA_DEADLINE_MS = 120_000;
/** Price guard for meme coins: the 1% pool fee is inside every quote, so warn at 2% and block at 5% from the mid. */
export const MEME_GUARD = { warn: 0.02, block: 0.05 } as const;
/** Buys wait while the pool's mid is this far from the price indexers last saw (it just jumped, or was pushed). */
export const MEME_MAX_DISAGREEMENT = 0.1;

/** Why a meme-coin buy should wait because the pool and the indexers disagree, or null. */
export function disagreementProblem(assetId: string, disagreement: number | undefined): string | null {
  if (disagreement == null || disagreement <= MEME_MAX_DISAGREEMENT) return null;
  return `${assetId}'s pool price is ${(disagreement * 100).toFixed(0)}% away from its recent trades. That usually means a big trade just hit the pool. Try again in a few minutes.`;
}

const SWAP_KEYS = ["client_echo", "min_output_amount", "output_token", "pool_ids", "skip_unwrap_near"];

export function tokenOf(intentsAssetId: string): string {
  if (!intentsAssetId.startsWith("nep141:")) throw new Error(`Not a NEP-141 token: ${intentsAssetId}`);
  return intentsAssetId.slice("nep141:".length);
}

/** Every pool a Rhea leg may route through: USDC/wNEAR plus each meme coin's main pool. */
export function allowedPools(assets: Asset[] = ASSETS): Set<string> {
  return new Set([USDC_WNEAR_POOL, ...assets.filter((a) => a.rhea).map((a) => a.rhea!.pool)]);
}

/** Which venue moves `from` into `to` (our asset ids). A swap goes to Rhea when either side is a Rhea asset. */
export function isRheaPair(from: string, to: string): boolean {
  return getAsset(from).venue === "rhea" || getAsset(to).venue === "rhea";
}

/**
 * DCL pool path for one swap, in hop order. USDC ↔ meme goes through wNEAR in one multi-hop swap; wNEAR ↔ meme is
 * one hop. Anything else (meme ↔ meme, meme ↔ stock) isn't a leg we build.
 */
export function routeFor(fromId: string, toId: string): string[] {
  const from = getAsset(fromId);
  const to = getAsset(toId);
  const meme = from.rhea ? from : to.rhea ? to : null;
  const other = meme === from ? to : from;
  if (!meme || other.rhea) throw new Error(`No Rhea route from ${fromId} to ${toId}.`);
  if (other.id === "USDC") return meme === to ? [USDC_WNEAR_POOL, meme.rhea!.pool] : [meme.rhea!.pool, USDC_WNEAR_POOL];
  if (other.id === "NEAR") return [meme.rhea!.pool];
  throw new Error(`No Rhea route from ${fromId} to ${toId}.`);
}

export const minOutput = (quoteOut: bigint, slippageBps = RHEA_SLIPPAGE_BPS): bigint => (quoteOut * BigInt(10_000 - slippageBps)) / 10_000n;

export interface SwapSpec {
  account: string; // the basket account: signer and client_echo
  token: string; // input NEP-141 contract
  amount: string; // input, smallest units
  poolIds: string[];
  outputToken: string; // output NEP-141 contract
  minOut: string; // min_output_amount
}

/** The one intent a basket account signs for a Rhea swap. Key order is fixed so the payload is reproducible. */
export function swapIntent(s: SwapSpec): Intent {
  const msg = JSON.stringify({
    Swap: { pool_ids: s.poolIds, output_token: s.outputToken, min_output_amount: s.minOut, skip_unwrap_near: true, client_echo: s.account },
  });
  return { intent: "ft_withdraw", token: s.token, receiver_id: DCL_CONTRACT, amount: s.amount, msg, min_gas: RHEA_MIN_GAS };
}

/** Plain withdrawal of a meme coin to a NEAR account (ft_transfer, no msg). */
export function withdrawIntent(w: { token: string; receiver: string; amount: string }): Intent {
  return { intent: "ft_withdraw", token: w.token, receiver_id: w.receiver, amount: w.amount };
}

const keysAre = (o: object, keys: string[]) => {
  const k = Object.keys(o).sort();
  return k.length === keys.length && k.every((x, i) => x === [...keys].sort()[i]);
};

/**
 * The relay allowlist for a Rhea swap leg. Returns why the payload is refused, or null when it is exactly the swap we
 * planned: one ft_withdraw of the leg's token and amount to the DCL contract, a Swap msg with only the expected keys,
 * every pool on the allowlist and in the planned order, the planned output token, at least the planned minimum out,
 * skip_unwrap_near, and client_echo equal to the signer (so the output can only come back to the same account).
 */
export function checkSwapPayload(claim: { signer_id: string; intents: Intent[] }, expected: SwapSpec, pools = allowedPools()): string | null {
  if (claim.signer_id !== expected.account) return "signed for another account";
  if (claim.intents.length !== 1) return "expected exactly one intent";
  const i = claim.intents[0] as Record<string, unknown>;
  if (i.intent !== "ft_withdraw") return "not an ft_withdraw";
  const allowed = ["intent", "token", "receiver_id", "amount", "msg", "min_gas"];
  if (Object.keys(i).some((k) => !allowed.includes(k))) return "unexpected field on the withdraw";
  if (i.receiver_id !== DCL_CONTRACT) return "receiver is not the Rhea DCL contract";
  if (i.token !== expected.token) return "wrong input token";
  if (i.amount !== expected.amount) return "wrong amount";
  if (typeof i.msg !== "string") return "missing swap message";
  let msg: unknown;
  try {
    msg = JSON.parse(i.msg);
  } catch {
    return "swap message is not JSON";
  }
  if (!msg || typeof msg !== "object" || !keysAre(msg, ["Swap"])) return "message is not a Swap";
  const sw = (msg as { Swap: Record<string, unknown> }).Swap;
  if (!sw || typeof sw !== "object" || !keysAre(sw, SWAP_KEYS)) return "unexpected Swap fields";
  if (!Array.isArray(sw.pool_ids) || !sw.pool_ids.length || sw.pool_ids.some((p) => typeof p !== "string" || !pools.has(p))) return "pool not on the allowlist";
  if (JSON.stringify(sw.pool_ids) !== JSON.stringify(expected.poolIds)) return "pools differ from the planned route";
  if (sw.output_token !== expected.outputToken) return "wrong output token";
  if (sw.skip_unwrap_near !== true) return "skip_unwrap_near must be true";
  if (sw.client_echo !== claim.signer_id) return "client_echo must be the signer";
  if (typeof sw.min_output_amount !== "string" || !/^\d+$/.test(sw.min_output_amount)) return "bad min_output_amount";
  if (BigInt(sw.min_output_amount) < BigInt(expected.minOut) || BigInt(sw.min_output_amount) === 0n) return "minimum out is below the plan";
  return null;
}

/** The relay allowlist for a meme withdrawal: one ft_withdraw (no msg) of the leg's token and amount to the leg's recipient. */
export function checkWithdrawPayload(claim: { signer_id: string; intents: Intent[] }, expected: { account: string; token: string; receiver: string; amount: string }): string | null {
  if (claim.signer_id !== expected.account) return "signed for another account";
  if (claim.intents.length !== 1) return "expected exactly one intent";
  const i = claim.intents[0] as Record<string, unknown>;
  if (i.intent !== "ft_withdraw") return "not an ft_withdraw";
  if (!keysAre(i, ["intent", "token", "receiver_id", "amount"])) return "unexpected field on the withdraw";
  if (i.token !== expected.token || i.receiver_id !== expected.receiver || i.amount !== expected.amount) return "withdrawal differs from the plan";
  return null;
}

// ---------- settlement ----------

export interface ReceiptLogs {
  executor_id: string;
  logs: string[];
}

interface MtEvent {
  standard: string;
  event: string;
  data: { owner_id: string; token_ids: string[]; amounts: string[]; memo?: string }[];
}

/** nep245 mt_mint / mt_burn events that intents.near itself logged (other contracts' logs could imitate them). */
function mtEvents(receipts: ReceiptLogs[], event: "mt_mint" | "mt_burn"): MtEvent["data"] {
  const out: MtEvent["data"] = [];
  for (const r of receipts) {
    if (r.executor_id !== INTENTS_CONTRACT) continue;
    for (const line of r.logs) {
      if (!line.startsWith("EVENT_JSON:")) continue;
      try {
        const e = JSON.parse(line.slice("EVENT_JSON:".length)) as MtEvent;
        if (e.standard === "nep245" && e.event === event && Array.isArray(e.data)) out.push(...e.data);
      } catch {
        /* not ours */
      }
    }
  }
  return out;
}

function sumFor(events: MtEvent["data"], owner: string, tokenId: string): bigint {
  let s = 0n;
  for (const d of events) {
    if (d.owner_id !== owner) continue;
    d.token_ids.forEach((t, k) => {
      if (t === tokenId) s += BigInt(d.amounts[k] ?? "0");
    });
  }
  return s;
}

export type Settlement = { outcome: "success"; amountOut: string; refunded: string } | { outcome: "refunded"; refunded: string } | { outcome: "unknown" };

/**
 * What a relayed Rhea swap did, from the full (FINAL) receipt logs: the output minted back to the basket account =
 * success; the input minted back and no output = refunded (min out not met, or Rhea failed). Neither = unknown.
 * `inputId` / `outputId` are intents token ids ("nep141:…").
 */
export function swapSettlement(receipts: ReceiptLogs[], account: string, inputId: string, outputId: string): Settlement {
  const mints = mtEvents(receipts, "mt_mint");
  const out = sumFor(mints, account, outputId);
  const back = sumFor(mints, account, inputId);
  if (out > 0n) return { outcome: "success", amountOut: out.toString(), refunded: back.toString() };
  if (back > 0n) return { outcome: "refunded", refunded: back.toString() };
  return { outcome: "unknown" };
}

/** A plain withdrawal: burned from the account and not minted back = delivered; minted back = the transfer failed. */
export function withdrawSettlement(receipts: ReceiptLogs[], account: string, tokenId: string): Settlement {
  const burned = sumFor(mtEvents(receipts, "mt_burn"), account, tokenId);
  const back = sumFor(mtEvents(receipts, "mt_mint"), account, tokenId);
  if (back > 0n) return { outcome: "refunded", refunded: back.toString() };
  if (burned > 0n) return { outcome: "success", amountOut: burned.toString(), refunded: "0" };
  return { outcome: "unknown" };
}

/** Flatten a NEAR FinalExecutionOutcome (RPC JSON) into receipt logs. */
export function receiptLogs(outcome: { receipts_outcome?: { outcome: { executor_id: string; logs: string[] } }[] }): ReceiptLogs[] {
  return (outcome.receipts_outcome ?? []).map((r) => ({ executor_id: r.outcome.executor_id, logs: r.outcome.logs ?? [] }));
}

// ---------- pricing ----------

/** DCL point → price of one token_x in token_y (human units). price = 1.0001^point × 10^(decX − decY). */
export function pointToPrice(point: number, decX: number, decY: number): number {
  return Math.pow(1.0001, point) * 10 ** (decX - decY);
}

/** USD mid price of a meme coin from its DCL pool against wNEAR and a NEAR/USD price. */
export function memeMidUsd(pool: { token_x: string; token_y: string; current_point: number }, memeToken: string, memeDecimals: number, nearUsd: number): number {
  const WNEAR_DEC = 24;
  if (pool.token_x === memeToken && pool.token_y === WNEAR) return pointToPrice(pool.current_point, memeDecimals, WNEAR_DEC) * nearUsd;
  if (pool.token_y === memeToken && pool.token_x === WNEAR) return nearUsd / pointToPrice(pool.current_point, WNEAR_DEC, memeDecimals);
  throw new Error(`Pool ${pool.token_x}|${pool.token_y} is not ${memeToken}/wNEAR`);
}

/** Cost of a swap against the mid: 1 − (value out at mid ÷ value in at mid). 0.012 = 1.2%. */
export function costVsMid(p: { usdIn: number; unitsOut: number; midUsd: number } | { unitsIn: number; midUsd: number; usdOut: number }): number {
  return "usdIn" in p ? 1 - (p.unitsOut * p.midUsd) / p.usdIn : 1 - p.usdOut / (p.unitsIn * p.midUsd);
}

// ---------- token safety (upgradable launchpad tokens) ----------

export interface TokenSafety {
  ok: boolean;
  reason?: string;
  transferFeePips?: number;
  codeHash?: string;
}

/**
 * HOOT's contract can be upgraded and can turn on a transfer fee. Buys stay open only while the fee is 0 and the
 * code is the build we checked. (Sells stay open either way: a holder must always be able to get out.)
 */
export function judgeSafety(a: Asset, seen: { transferFeePips?: number | null; codeHash?: string | null }): TokenSafety {
  const r = a.rhea;
  if (!r) return { ok: true };
  if (r.transferFeeView) {
    if (seen.transferFeePips == null) return { ok: false, reason: `${a.id}: couldn't read its transfer fee.` };
    if (seen.transferFeePips !== 0) return { ok: false, reason: `${a.id} now charges a ${(seen.transferFeePips / 10_000).toFixed(2)}% transfer fee.`, transferFeePips: seen.transferFeePips };
  }
  if (r.pinnedCodeHash) {
    if (!seen.codeHash) return { ok: false, reason: `${a.id}: couldn't read its contract code.` };
    if (seen.codeHash !== r.pinnedCodeHash) return { ok: false, reason: `${a.id}'s token contract was upgraded since we checked it.`, codeHash: seen.codeHash };
  }
  return { ok: true, transferFeePips: seen.transferFeePips ?? undefined, codeHash: seen.codeHash ?? undefined };
}
