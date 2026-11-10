// Check the agent's output against intents.near, read-only (simulate_intents and has_public_key; nothing is sent).
// Usage: node agent/rebalancer/verify.mjs <run-output.json>   (or --selftest to try a local throwaway key)
// Run from the repo root so @noble/* resolve from the app's node_modules.
import { readFileSync } from "node:fs";
import { ed25519 } from "@noble/curves/ed25519.js";
import { base58 } from "@scure/base";

const RPC = process.env.NEAR_RPC_URL || "https://rpc.mainnet.fastnear.com";
async function view(method, args) {
  const r = await fetch(RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "query", params: { request_type: "call_function", finality: "final", account_id: "intents.near", method_name: method, args_base64: Buffer.from(JSON.stringify(args)).toString("base64") } }),
  }).then((x) => x.json());
  if (r.error) return { error: JSON.stringify(r.error).slice(0, 600) };
  if (r.result?.error) return { error: String(r.result.error).slice(0, 600) };
  return { ok: JSON.parse(Buffer.from(r.result.result).toString()) };
}

function localSign(payloadFor) {
  const sk = ed25519.utils.randomSecretKey();
  const pk = ed25519.getPublicKey(sk);
  const account = Buffer.from(pk).toString("hex");
  const payload = payloadFor(account);
  return { standard: "raw_ed25519", payload, public_key: `ed25519:${base58.encode(pk)}`, signature: `ed25519:${base58.encode(ed25519.sign(new TextEncoder().encode(payload), sk))}` };
}

const nonce = () => Buffer.from(crypto.getRandomValues(new Uint8Array(32)).map((b, i) => (i === 0 ? b & 0x7f : b))).toString("base64");
const payloadFor = (account) => JSON.stringify({ signer_id: account, verifying_contract: "intents.near", deadline: new Date(Date.now() + 300_000).toISOString(), nonce: nonce(), intents: [{ intent: "transfer", receiver_id: "ai-creator.near", tokens: { "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1": "1000" }, memo: "stonkbag agent spike" }] });

async function check(label, signed) {
  const p = JSON.parse(signed.payload);
  const pk = base58.decode(signed.public_key.slice(8));
  const sigOk = ed25519.verify(base58.decode(signed.signature.slice(8)), new TextEncoder().encode(signed.payload), pk);
  const implicitOk = p.signer_id === Buffer.from(pk).toString("hex");
  const hasKey = await view("has_public_key", { account_id: p.signer_id, public_key: signed.public_key });
  const sim = await view("simulate_intents", { signed: [signed] });
  console.log(`\n== ${label}`);
  console.log("signature verifies locally:", sigOk);
  console.log("signer is the key's implicit account:", implicitOk);
  console.log("intents.near has_public_key:", hasKey.ok ?? hasKey.error);
  console.log("simulate_intents:", sim.ok ? "ACCEPTED " + JSON.stringify(sim.ok).slice(0, 300) : sim.error);
}

if (process.argv[2] === "--selftest") {
  await check("local key, good signature (expect: fails only on balance)", localSign(payloadFor));
  const bad = localSign(payloadFor);
  bad.signature = localSign(payloadFor).signature;
  await check("local key, wrong signature (expect: signature error)", bad);
} else {
  const out = JSON.parse(readFileSync(process.argv[2], "utf8"));
  const signed = out.signed ?? out.result?.signed ?? out.output?.result?.signed;
  if (!signed) throw new Error("no signed intent in that file");
  await check("OutLayer agent", signed);
}
