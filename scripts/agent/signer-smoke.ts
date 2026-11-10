// Ask the signer to sign one real 1Click leg and one real Rhea leg for a basket account, WITHOUT submitting either.
// Spends two OutLayer runs. Usage: npx tsx --conditions react-server --env-file=.env.local scripts/agent/signer-smoke.ts <account>
import { attestationUrl, runModule, signerModule } from "@/lib/agent/outlayer";
import { oneclick } from "@/lib/oneclick";

const account = process.argv[2];
const USDC = "17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1";
const NEARLY = "nearly-993927.nearlytrade.near";
const assets = [`nep141:${USDC}`, "nep141:wrap.near", `nep141:${NEARLY}`];
type Out = { ok: boolean; error?: string; result?: { signed: { payload: string }; usd: number }; txHash: string };
const show = (label: string, r: Out) =>
  console.log(label, r.ok ? `signed, $${r.result!.usd}, nonce ${JSON.parse(r.result!.signed.payload).nonce}` : `refused: ${r.error}`, "\n  proof:", attestationUrl(r.txHash));

// 1. A 1Click leg: $2 USDC -> wNEAR.
const q = await oneclick.quote({
  dry: false,
  slippageTolerance: 100,
  originAsset: assets[0],
  depositType: "INTENTS",
  destinationAsset: assets[1],
  amount: "2000000",
  recipient: account,
  recipientType: "INTENTS",
  refundTo: account,
  refundType: "INTENTS",
});
const gen = await oneclick.generateIntent(q.quote.depositAddress!, account, "raw_ed25519");
const payload = typeof gen.intent.payload === "string" ? gen.intent.payload : JSON.stringify(gen.intent.payload);
show("1click", await runModule(signerModule()!, { op: "sign_leg", account_id: account, deposit_address: q.quote.depositAddress, payload, assets, max_usd: 100 }, { seconds: 30 }));

// 2. A Rhea leg: $2 USDC -> NEARLY through USDC/wNEAR and NEARLY/wNEAR.
const pool_ids = [`${USDC}|wrap.near|100`, `${NEARLY}|wrap.near|10000`];
const args = Buffer.from(JSON.stringify({ pool_ids, input_token: USDC, output_token: NEARLY, input_amount: "2000000", tag: null })).toString("base64");
const rpc = await fetch("https://rpc.mainnet.near.org", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "query", params: { request_type: "call_function", finality: "final", account_id: "dclv2.ref-labs.near", method_name: "quote", args_base64: args } }),
}).then((r) => r.json());
const quoted = BigInt(JSON.parse(Buffer.from(rpc.result.result).toString()).amount);
const msg = JSON.stringify({ Swap: { pool_ids, output_token: NEARLY, min_output_amount: ((quoted * 98n) / 100n).toString(), skip_unwrap_near: true, client_echo: account } });
const rheaPayload = JSON.stringify({
  signer_id: account,
  verifying_contract: "intents.near",
  deadline: new Date(Date.now() + 5 * 60_000).toISOString(),
  nonce: Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64"),
  intents: [{ intent: "ft_withdraw", token: USDC, receiver_id: "dclv2.ref-labs.near", amount: "2000000", msg, min_gas: "150000000000000" }],
});
show("rhea", await runModule(signerModule()!, { op: "sign_rhea_leg", account_id: account, payload: rheaPayload, assets, max_usd: 100 }, { seconds: 30 }));
process.exit(0);
