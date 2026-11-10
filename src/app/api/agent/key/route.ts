// The agent's public key (the one holders add to their basket account), and its attested whoami run.
// GET reads the cached key and never spends. POST (admins) asks the signer again: one OutLayer run.
import { handle } from "@/lib/auth/session";
import { requireAdmin } from "@/lib/auth/admin";
import { agentKey } from "@/lib/agent/run";
import { attestationUrl } from "@/lib/agent/outlayer";

// `caller` is the relayer account the agent's OutLayer runs come from. It is public on-chain (it signs every run), and
// the agent key and the model-key access list both depend on it.
const view = (k: Awaited<ReturnType<typeof agentKey>>) =>
  k ? { publicKey: k.publicKey, accountId: k.accountId, build: k.hash, proof: attestationUrl(k.txHash), caller: process.env.RELAYER_ACCOUNT_ID ?? null } : null;

export async function GET() {
  return handle(async () => Response.json({ key: view(await agentKey()) }));
}

export async function POST() {
  return handle(async () => {
    await requireAdmin();
    return Response.json({ key: view(await agentKey({ refresh: true })) });
  });
}
