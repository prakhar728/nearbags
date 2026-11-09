// Relay the "add my wallet as recovery key" intent for one of the user's basket accounts (spec §4.1).
// Allowlist: signer must be the user's own position account, and the only intent allowed is add_public_key
// with the user's verified wallet key. Anything else is refused before it reaches the relayer.
import { rateLimit } from "@/lib/ratelimit";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { handle, HttpError, requireSession } from "@/lib/auth/session";
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

    const [user] = await db().select().from(schema.users).where(eq(schema.users.id, s.userId));
    if (!user.walletPubkey) throw new HttpError(400, "No wallet key on file. Sign in again.");
    const only = claim.intents.length === 1 && claim.intents[0].intent === "add_public_key" && claim.intents[0].public_key === user.walletPubkey;
    if (!only) throw new HttpError(403, "Only adding your own wallet as recovery key is allowed here.");

    if (await hasPublicKey(pos.accountId, user.walletPubkey)) {
      await db().update(schema.positions).set({ recoveryKeyAddedAt: new Date() }).where(eq(schema.positions.id, pos.id));
      return Response.json({ alreadyAdded: true });
    }
    try {
      const { txHash } = await relay([signed]);
      await db().update(schema.positions).set({ recoveryKeyAddedAt: new Date() }).where(eq(schema.positions.id, pos.id));
      await db().insert(schema.auditLog).values({ actor: `user:${s.userId}`, action: "relay.recovery_key", target: pos.accountId, details: { txHash } });
      return Response.json({ txHash });
    } catch (e) {
      if (e instanceof RelayerNotConfigured) throw new HttpError(503, e.message);
      throw new HttpError(400, `The contract refused it: ${(e as Error).message.slice(0, 200)}`);
    }
  });
}
