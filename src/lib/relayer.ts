// Relayer (spec §3, §10): a platform NEAR account that pays gas to execute already-signed intents on intents.near.
// It never signs intents itself and holds no user funds. Every batch is simulated first, so a bad payload
// costs nothing and the caller gets the contract's error message.
import "server-only";
import { Account, JsonRpcProvider, teraToGas, type KeyPairString } from "near-api-js-v7";
import type { SignedIntent } from "@/lib/intents/wallet-sign";
import { rpcUrl, simulateIntents, type SimulationOutput } from "@/lib/intents/rpc";

let account: Account | null = null;

function relayerAccount(): Account {
  if (account) return account;
  const id = process.env.RELAYER_ACCOUNT_ID;
  const key = process.env.RELAYER_PRIVATE_KEY as KeyPairString | undefined;
  if (!id || !key) throw new RelayerNotConfigured();
  account = new Account(id, new JsonRpcProvider({ url: rpcUrl() }), key);
  return account;
}

export class RelayerNotConfigured extends Error {
  constructor() {
    super("Relayer is not configured (RELAYER_ACCOUNT_ID / RELAYER_PRIVATE_KEY).");
  }
}

export interface RelayResult {
  txHash: string;
  simulation: SimulationOutput;
}

export async function relay(signed: SignedIntent[]): Promise<RelayResult> {
  const simulation = await simulateIntents(signed); // throws with the contract's reason on failure
  const res = await relayerAccount().callFunctionRaw({
    contractId: "intents.near",
    methodName: "execute_intents",
    args: { signed },
    gas: teraToGas("300"),
    deposit: 0n,
    waitUntil: "FINAL",
  });
  const status = res.status as unknown as { Failure?: unknown } | undefined;
  if (status && typeof status === "object" && "Failure" in status) {
    throw new Error(`execute_intents failed: ${JSON.stringify(status.Failure).slice(0, 400)}`);
  }
  return { txHash: res.transaction.hash, simulation };
}

export const relayerConfigured = () => Boolean(process.env.RELAYER_ACCOUNT_ID && process.env.RELAYER_PRIVATE_KEY);
