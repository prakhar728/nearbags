// The agent's public key (the one holders add to their basket account), and its attested whoami run.
// GET reads the cached key and never spends. POST (admins) asks the signer again: one OutLayer run.
import { handle } from "@/lib/auth/session";
import { requireAdmin } from "@/lib/auth/admin";
import { agentKey } from "@/lib/agent/run";
import { attestationUrl } from "@/lib/agent/outlayer";

const view = (k: Awaited<ReturnType<typeof agentKey>>) => (k ? { publicKey: k.publicKey, accountId: k.accountId, build: k.hash, proof: attestationUrl(k.txHash) } : null);

export async function GET() {
  return handle(async () => Response.json({ key: view(await agentKey()) }));
}

export async function POST() {
  return handle(async () => {
    await requireAdmin();
    return Response.json({ key: view(await agentKey({ refresh: true })) });
  });
}
