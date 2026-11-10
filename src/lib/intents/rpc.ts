// Read-only NEAR RPC calls against intents.near. Works in browser and server.
import type { SignedIntent } from "./wallet-sign";

const DEFAULT_RPC = "https://rpc.mainnet.fastnear.com";
export const rpcUrl = () => (typeof process !== "undefined" && process.env?.NEAR_RPC_URL) || DEFAULT_RPC;

async function viewCall<T>(method: string, args: unknown, contract = "intents.near"): Promise<T> {
  const res = await fetch(rpcUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "nearbags",
      method: "query",
      params: {
        request_type: "call_function",
        finality: "final",
        account_id: contract,
        method_name: method,
        args_base64: btoa(JSON.stringify(args)),
      },
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const j = await res.json();
  if (j.error) throw new Error(`RPC ${method}: ${JSON.stringify(j.error).slice(0, 300)}`);
  if (j.result?.error) throw new Error(`${method}: ${String(j.result.error).slice(0, 400)}`);
  const bytes: number[] = j.result.result;
  return JSON.parse(new TextDecoder().decode(new Uint8Array(bytes))) as T;
}

/** A read-only view call on any contract (Rhea's DCL quote, a token's ft_metadata…). */
export const viewFunction = <T>(contract: string, method: string, args: unknown = {}) => viewCall<T>(method, args, contract);

/** Raw JSON-RPC (view_account, tx status…). Throws on an RPC error. */
export async function rpcRaw<T>(method: string, params: unknown): Promise<T> {
  const res = await fetch(rpcUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "nearbags", method, params }),
    signal: AbortSignal.timeout(20_000),
  });
  const j = await res.json();
  if (j.error) throw new Error(`RPC ${method}: ${JSON.stringify(j.error).slice(0, 300)}`);
  return j.result as T;
}

export const hasPublicKey = (accountId: string, publicKey: string) =>
  viewCall<boolean>("has_public_key", { account_id: accountId, public_key: publicKey });

export const publicKeysOf = (accountId: string) => viewCall<string[]>("public_keys_of", { account_id: accountId });

/** Balances in smallest units, in the same order as tokenIds. */
export const balancesOf = (accountId: string, tokenIds: string[]) =>
  viewCall<string[]>("mt_batch_balance_of", { account_id: accountId, token_ids: tokenIds });

export interface SimulationOutput {
  intents_executed: { intent_hash: string; account_id: string; nonce: string }[];
  logs: string[];
  min_deadline?: string;
  invariant_violated?: unknown;
  state?: unknown;
}

/** Dry-run signed payloads against current mainnet state. Throws with the contract's panic message on failure. */
export const simulateIntents = (signed: SignedIntent[]) => viewCall<SimulationOutput>("simulate_intents", { signed });
