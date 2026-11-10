// Ask the signer for the agent's key (one OutLayer run from the relayer account) and cache it in settings,
// the same way lib/agent/run.ts agentKey({ refresh: true }) does (that module needs the Next runtime).
// Usage: npx tsx --conditions react-server --env-file=.env.local scripts/agent/key.ts
import { db, schema } from "@/db";
import { attestationUrl, runModule, signerModule } from "@/lib/agent/outlayer";

const mod = signerModule();
if (!mod) throw new Error("AGENT_SIGNER_WASM_URL / AGENT_SIGNER_WASM_HASH are not set.");
const r = await runModule<{ account_id: string; public_key: string }>(mod, { op: "whoami" }, { seconds: 10 });
if (!r.ok || !r.result) throw new Error(`whoami failed (tx ${r.txHash}): ${r.error}`);
const key = { hash: mod.hash, publicKey: r.result.public_key, accountId: r.result.account_id, txHash: r.txHash };
await db().insert(schema.settings).values({ key: "agent_signer", value: key }).onConflictDoUpdate({ target: schema.settings.key, set: { value: key } });
console.log(JSON.stringify({ ...key, proof: attestationUrl(r.txHash) }, null, 2));
process.exit(0);
