// Rhea DCL legs for meme coins: chain reads (quotes, pool state, token safety, relayed tx outcome). Read-only RPC
// view calls; nothing here signs or sends. The pure rules (route, intent, allowlist, settlement) are in rhea-core.ts.
import "server-only";
import { getAsset, type Asset } from "@/lib/assets";
import { rpcRaw, viewFunction } from "@/lib/intents/rpc";
import { DCL_CONTRACT, judgeSafety, memeMidUsd, receiptLogs, routeFor, tokenOf, type ReceiptLogs, type TokenSafety } from "./rhea-core";

export * from "./rhea-core";

export class RheaNoLiquidity extends Error {
  constructor(what: string) {
    super(`${what} isn't tradable on Rhea right now (no liquidity for this size).`);
  }
}

/** Exact output of a DCL swap along pool_ids, from the contract's own quote view. 0 = no route or not enough liquidity. */
export async function dclQuote(poolIds: string[], inputToken: string, outputToken: string, amount: string): Promise<bigint> {
  const r = await viewFunction<{ amount: string }>(DCL_CONTRACT, "quote", { pool_ids: poolIds, input_token: inputToken, output_token: outputToken, input_amount: amount, tag: null });
  return BigInt(r?.amount ?? "0");
}

export interface RheaQuote {
  poolIds: string[];
  inputToken: string;
  outputToken: string;
  amountIn: string;
  amountOut: string;
}

/** Quote one leg between our asset ids (e.g. USDC → HOOT). Throws RheaNoLiquidity when the pool can't fill it. */
export async function quoteLeg(fromId: string, toId: string, amountIn: string): Promise<RheaQuote> {
  const from = getAsset(fromId);
  const to = getAsset(toId);
  const poolIds = routeFor(fromId, toId);
  const inputToken = tokenOf(from.intentsAssetId);
  const outputToken = tokenOf(to.intentsAssetId);
  const out = await dclQuote(poolIds, inputToken, outputToken, amountIn);
  if (out <= 0n) throw new RheaNoLiquidity((from.rhea ? from : to).id);
  return { poolIds, inputToken, outputToken, amountIn, amountOut: out.toString() };
}

interface PoolState {
  token_x: string;
  token_y: string;
  current_point: number;
}
const poolCache = new Map<string, { at: number; p: Promise<PoolState> }>();

async function poolState(poolId: string): Promise<PoolState> {
  const hit = poolCache.get(poolId);
  if (hit && Date.now() - hit.at < 30_000) return hit.p;
  const p = viewFunction<PoolState>(DCL_CONTRACT, "get_pool", { pool_id: poolId });
  poolCache.set(poolId, { at: Date.now(), p });
  p.catch(() => poolCache.delete(poolId));
  return p;
}

/** USD mid of a meme coin: its DCL pool's current point × NEAR/USD. */
export async function memeMid(a: Asset, nearUsd: number): Promise<number> {
  if (!a.rhea) throw new Error(`${a.id} is not a Rhea asset`);
  return memeMidUsd(await poolState(a.rhea.pool), a.rhea.token, a.decimals, nearUsd);
}

// ---------- token safety (cached 5 minutes) ----------

const SAFETY_TTL = 5 * 60_000;
const safetyCache = new Map<string, { at: number; s: Promise<TokenSafety> }>();

async function readSafety(a: Asset): Promise<TokenSafety> {
  const r = a.rhea!;
  const [cfg, acct] = await Promise.all([
    r.transferFeeView ? viewFunction<{ transfer_fee_pips?: number }>(r.token, "get_config").catch(() => null) : Promise.resolve(null),
    r.pinnedCodeHash ? rpcRaw<{ code_hash: string }>("query", { request_type: "view_account", finality: "final", account_id: r.token }).catch(() => null) : Promise.resolve(null),
  ]);
  return judgeSafety(a, { transferFeePips: cfg?.transfer_fee_pips ?? null, codeHash: acct?.code_hash ?? null });
}

/** Is this meme coin still the contract we checked (no transfer fee, same code)? Non-Rhea assets are always fine. */
export async function tokenSafety(assetId: string): Promise<TokenSafety> {
  const a = getAsset(assetId);
  if (!a.rhea || (!a.rhea.transferFeeView && !a.rhea.pinnedCodeHash)) return { ok: true };
  let hit = safetyCache.get(a.id);
  if (!hit || Date.now() - hit.at > SAFETY_TTL) {
    hit = { at: Date.now(), s: readSafety(a) };
    safetyCache.set(a.id, hit);
  }
  return hit.s;
}

// ---------- settlement and withdrawals ----------

/** Receipt logs of a relayed tx, once it is final (for legs whose relay call returned before we could read them). */
export async function txReceipts(txHash: string, sender: string): Promise<ReceiptLogs[] | null> {
  try {
    const r = await rpcRaw<{ receipts_outcome?: { outcome: { executor_id: string; logs: string[] } }[]; final_execution_status?: string }>("tx", {
      tx_hash: txHash,
      sender_account_id: sender,
      wait_until: "FINAL",
    });
    return receiptLogs(r);
  } catch {
    return null;
  }
}

/** Can `account` receive this token (registered for storage on the token contract)? */
export async function storageRegistered(token: string, account: string): Promise<boolean> {
  const r = await viewFunction<unknown>(token, "storage_balance_of", { account_id: account });
  return r != null;
}

/** NEAR account ids: named (a.near, x.y.near) or 64-hex implicit. */
export const isNearAccountId = (s: string) => /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/.test(s) && s.length >= 2 && s.length <= 64;
