// Relay "let the agent manage this basket": add the agent's key to one of the user's basket accounts.
// Allowlist: the signer must be the user's own position account, on an agent-managed basket, and the only intent
// allowed is add_public_key with the agent's current key. Anything else is refused before it reaches the relayer.
import { rateLimit } from "@/lib/ratelimit";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { handle, HttpError, requireSession } from "@/lib/auth/session";
import { agentKey } from "@/lib/agent/run";
import { parsePayload, type SignedRawEd25519 } from "@/lib/intents/payload";
import { hasPublicKey } from "@/lib/intents/rpc";
import { relay, RelayerNotConfigured } from "@/lib/relayer";

const Body = z.object({
  signed: z.object({ standard: z.literal("raw_ed25519"), payload: z.string().max(4000), public_key: z.string(), signature: z.string() }),
});

export async function POST(request: Request) {
  return handle(async () => {
    const s = await requireSession();
    await rateLimit("relay", 10, 60_000, String(s.userId));
    const p = Body.safeParse(await request.json());
    if (!p.success) throw new HttpError(400, "Malformed request.");
    const signed = p.data.signed as SignedRawEd25519;

    let claim;
    try {
      claim = parsePayload(signed);
    } catch (e) {
      throw new HttpError(400, (e as Error).message);
    }
    const [pos] = await db()
      .select()
      .from(schema.positions)
      .where(and(eq(schema.positions.userId, s.userId), eq(schema.positions.accountId, claim.signer_id)));
    if (!pos) throw new HttpError(403, "That basket account isn't yours.");
    const [basket] = await db().select().from(schema.baskets).where(eq(schema.baskets.id, pos.basketId));
    if (!basket?.agent) throw new HttpError(409, "This basket isn't agent-managed.");
    const key = await agentKey();
    if (!key) throw new HttpError(503, "The agent isn't set up yet.");
    const only = claim.intents.length === 1 && claim.intents[0].intent === "add_public_key" && claim.intents[0].public_key === key.publicKey;
    if (!only) throw new HttpError(403, "Only adding the agent's key is allowed here.");

    const mark = () =>
      db().update(schema.positions).set({ agentKeyAddedAt: new Date(), agentPublicKey: key.publicKey }).where(eq(schema.positions.id, pos.id));
    if (await hasPublicKey(pos.accountId, key.publicKey)) {
      await mark();
      return Response.json({ alreadyAdded: true });
    }
    try {
      const { txHash } = await relay([signed]);
      await mark();
      await db().insert(schema.auditLog).values({ actor: `user:${s.userId}`, action: "relay.agent_key", target: pos.accountId, details: { txHash, agentKey: key.publicKey } });
      return Response.json({ txHash });
    } catch (e) {
      if (e instanceof RelayerNotConfigured) throw new HttpError(503, e.message);
      throw new HttpError(400, `The contract refused it: ${(e as Error).message.slice(0, 200)}`);
    }
  });
}
