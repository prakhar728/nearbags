"use client";
// Pay a 1Click deposit address straight from the connected wallet: EVM (native coin or ERC-20) or NEAR (NEP-141).
import type { ConnectorAction } from "@hot-labs/near-connect";
import { erc20Abi, type Hex } from "viem";
import type { Config } from "wagmi";
import { sendTransaction, switchChain, writeContract } from "wagmi/actions";
import { rpcUrl } from "@/lib/intents/rpc";
import { nearSendTransactions } from "./near";

export const EVM_CHAIN_IDS: Record<string, number> = { eth: 1, arb: 42161, base: 8453, op: 10, pol: 137, bsc: 56 };

export interface PayToken {
  assetId: string;
  symbol: string;
  chain: string;
  decimals: number;
  price: number;
  contract: string | null;
}

export const canPayFromEvm = (t: PayToken) => t.chain in EVM_CHAIN_IDS;

export async function payFromEvm(config: Config, t: PayToken, to: string, amount: string): Promise<Hex> {
  const chainId = EVM_CHAIN_IDS[t.chain];
  await switchChain(config, { chainId });
  if (!t.contract) return sendTransaction(config, { chainId, to: to as Hex, value: BigInt(amount) });
  return writeContract(config, { chainId, address: t.contract as Hex, abi: erc20Abi, functionName: "transfer", args: [to as Hex, BigInt(amount)] });
}

// ── NEAR wallets: pay a NEAR-chain token (USDC, USDT, wNEAR, …) to the 1Click deposit address in one approval ──────
// The deposit address is a fresh implicit account, so it is registered on the token contract first (storage_deposit,
// refunded if it already was). For wNEAR, native NEAR is wrapped first when the wallet doesn't hold enough wNEAR.

const TGAS = 10n ** 12n;
const STORAGE_DEPOSIT = 1_250_000_000_000_000_000_000n; // 0.00125 NEAR, the usual NEP-145 registration cost
export const canPayFromNear = (t: PayToken) => t.chain === "near" && !!t.contract;

async function rpc<T>(params: Record<string, unknown>): Promise<T> {
  const res = await fetch(rpcUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "nearbags", method: "query", params: { finality: "final", ...params } }),
    signal: AbortSignal.timeout(20_000),
  });
  const j = await res.json();
  if (j.error || j.result?.error) throw new Error(`NEAR RPC: ${JSON.stringify(j.error ?? j.result.error).slice(0, 200)}`);
  return j.result as T;
}

/** A token balance on NEAR (NEP-141 ft_balance_of), raw units. */
export async function nearFtBalance(contractId: string, accountId: string): Promise<bigint> {
  const r = await rpc<{ result: number[] }>({
    request_type: "call_function",
    account_id: contractId,
    method_name: "ft_balance_of",
    args_base64: btoa(JSON.stringify({ account_id: accountId })),
  });
  return BigInt(String(JSON.parse(new TextDecoder().decode(new Uint8Array(r.result))) ?? "0"));
}

/** Spendable native NEAR in yocto: the balance minus what storage locks. */
export async function nearBalance(accountId: string): Promise<bigint> {
  const a = await rpc<{ amount: string; locked: string; storage_usage: number }>({ request_type: "view_account", account_id: accountId });
  const storage = BigInt(a.storage_usage) * 10n ** 19n; // 1e19 yocto per byte
  const free = BigInt(a.amount) - (storage > BigInt(a.locked) ? storage - BigInt(a.locked) : 0n);
  return free > 0n ? free : 0n;
}

const call = (methodName: string, args: object, gas: bigint, deposit: bigint): ConnectorAction => ({
  type: "FunctionCall",
  params: { methodName, args, gas: gas.toString(), deposit: deposit.toString() },
});

const fmt = (raw: bigint, decimals: number) => (Number(raw) / 10 ** decimals).toLocaleString(undefined, { maximumFractionDigits: 6 });

export async function payFromNear(from: string, t: PayToken, to: string, amount: string): Promise<void> {
  const contractId = t.contract!;
  const want = BigInt(amount);
  const have = await nearFtBalance(contractId, from);
  const actions: ConnectorAction[] = [
    call("storage_deposit", { account_id: to, registration_only: true }, 30n * TGAS, STORAGE_DEPOSIT),
  ];
  if (have < want) {
    if (contractId !== "wrap.near") throw new Error(`Your wallet has ${fmt(have, t.decimals)} ${t.symbol} on NEAR; this needs ${fmt(want, t.decimals)}.`);
    const wrap = want - have;
    const free = await nearBalance(from);
    if (free < wrap + 2n * STORAGE_DEPOSIT + TGAS * 100_000n) throw new Error(`Your wallet doesn't have enough NEAR: this needs about ${fmt(want, 24)} NEAR plus a little for fees.`);
    // near_deposit takes the registration cost out of the wrapped amount for an unregistered caller; register first.
    actions.push(call("storage_deposit", { account_id: from, registration_only: true }, 30n * TGAS, STORAGE_DEPOSIT));
    actions.push(call("near_deposit", {}, 10n * TGAS, wrap));
  }
  actions.push(call("ft_transfer", { receiver_id: to, amount, memo: "nearbags deposit" }, 30n * TGAS, 1n));
  await nearSendTransactions(from, [{ receiverId: contractId, actions }]);
}
