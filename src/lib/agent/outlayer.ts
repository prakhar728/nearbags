// Run the agent's WASI modules on OutLayer (https://outlayer.ai), on-chain, from the relayer account.
//
// On-chain rather than OutLayer's HTTPS API because the signer's key is bound to its exact build (bind "wasm"), and
// such keys are only issued to direct runs of a wasm URL, which the HTTPS API does not offer. The caller is part of
// the key too: the relayer account calling a given signer build always gets the same key.
//
// Every run is attested by OutLayer (Intel TDX); the quote for a run is at attestationUrl(txHash).
import "server-only";
import { Account, JsonRpcProvider, teraToGas, type KeyPairString } from "near-api-js-v7";
import { rpcUrl } from "@/lib/intents/rpc";

const CONTRACT = "outlayer.near";

export interface Module {
  url: string; // FastFS URL of the wasm
  hash: string; // its sha256, which OutLayer checks before running it
}

export const signerModule = (): Module | null => moduleFromEnv("AGENT_SIGNER_WASM_URL", "AGENT_SIGNER_WASM_HASH");
export const strategistModule = (): Module | null => moduleFromEnv("AGENT_STRATEGIST_WASM_URL", "AGENT_STRATEGIST_WASM_HASH");

function moduleFromEnv(urlVar: string, hashVar: string): Module | null {
  const url = process.env[urlVar]?.trim();
  const hash = process.env[hashVar]?.trim();
  return url && hash && /^[0-9a-f]{64}$/.test(hash) ? { url, hash } : null;
}

/** Raw attestation JSON for a run. */
export const attestationUrl = (txHash: string) => `https://api.outlayer.ai/attestations/by-tx/${txHash}`;
/** Our redirect to OutLayer's readable report for a run (what the basket page links to). */
export const proofUrl = (txHash: string) => `/api/agent/proof/${txHash}`;

let account: Account | null = null;
function caller(): Account {
  if (account) return account;
  const id = process.env.RELAYER_ACCOUNT_ID;
  const key = process.env.RELAYER_PRIVATE_KEY as KeyPairString | undefined;
  if (!id || !key) throw new Error("The relayer account is not configured, so the agent can't run.");
  account = new Account(id, new JsonRpcProvider({ url: rpcUrl() }), key);
  return account;
}

async function view<T>(method: string, args: unknown): Promise<T> {
  const res = await fetch(rpcUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "nearbags",
      method: "query",
      params: { request_type: "call_function", finality: "final", account_id: CONTRACT, method_name: method, args_base64: Buffer.from(JSON.stringify(args)).toString("base64") },
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const j = await res.json();
  if (j.error || j.result?.error) throw new Error(`OutLayer ${method}: ${JSON.stringify(j.error ?? j.result.error).slice(0, 200)}`);
  return JSON.parse(Buffer.from(j.result.result).toString()) as T;
}

export interface RunResult<T> {
  txHash: string;
  ok: boolean;
  result?: T;
  error?: string;
}

/**
 * Run a module once. Our modules print {"success": true, "result": …} or {"success": false, "error": "…"}.
 * Throws only when the run itself could not happen (no funds, RPC down, OutLayer refused it).
 */
export async function runModule<T>(
  mod: Module,
  input: unknown,
  opts: { seconds?: number; secrets?: { profile: string; accountId: string } | null } = {},
): Promise<RunResult<T>> {
  const inputData = JSON.stringify(input);
  const resourceLimits = { max_instructions: 2_000_000_000, max_memory_mb: 128, max_execution_seconds: opts.seconds ?? 30 };
  const cost = BigInt(String(await view<string>("estimate_execution_cost", { resource_limits: resourceLimits, input_len: inputData.length })).replace(/"/g, ""));
  const res = await caller().callFunctionRaw({
    contractId: CONTRACT,
    methodName: "request_execution",
    args: {
      source: { WasmUrl: { url: mod.url, hash: mod.hash, build_target: "wasm32-wasip2" } },
      resource_limits: resourceLimits,
      input_data: inputData,
      secrets_ref: opts.secrets ? { profile: opts.secrets.profile, account_id: opts.secrets.accountId } : null,
      response_format: "Json",
      payer_account_id: null,
      params: null,
    },
    gas: teraToGas("300"),
    deposit: cost,
    waitUntil: "FINAL",
  });
  const txHash = res.transaction.hash;
  const status = res.status as unknown as { SuccessValue?: string; Failure?: unknown };
  if (status && typeof status === "object" && "Failure" in status) {
    throw new Error(`OutLayer run failed (tx ${txHash}): ${JSON.stringify(status.Failure).slice(0, 300)}`);
  }
  const raw = status?.SuccessValue ? Buffer.from(status.SuccessValue, "base64").toString() : "";
  let out: { success?: boolean; result?: T; error?: string };
  try {
    out = JSON.parse(raw);
    if (typeof out === "string") out = JSON.parse(out); // some responses arrive as a JSON string
  } catch {
    throw new Error(`OutLayer run returned something unreadable (tx ${txHash}).`);
  }
  return out?.success ? { txHash, ok: true, result: out.result } : { txHash, ok: false, error: String(out?.error ?? "The module gave no answer.").slice(0, 300) };
}
