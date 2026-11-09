// New device (spec §4.2, device mode): the user's WALLET signs "add this browser's new key" for one of their basket
// accounts, and the relayer executes it. Allowlist: the signer must be the user's own position account, the only
// intent is one add_public_key with an ed25519 key, and the signature must come from the user's verified wallet key.
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { handle, HttpError, requireSession } from "@/lib/auth/session";
import { parsePublicKey } from "@/lib/intents/keys";
import { hasPublicKey } from "@/lib/intents/rpc";
import { parseWalletSigned, walletSignerKey, type SignedErc191, type SignedNep413 } from "@/lib/intents/wallet-sign";
import { rateLimit } from "@/lib/ratelimit";
import { relay, RelayerNotConfigured } from "@/lib/relayer";

const Body = z.object({
  signed: z.union([
    z.object({ standard: z.literal("erc191"), payload: z.string().max(4000), signature: z.string().max(200) }),
    z.object({
      standard: z.literal("nep413"),
      payload: z.object({ message: z.string().max(4000), nonce: z.string().max(64), recipient: z.string().max(64) }),
      public_key: z.string().max(100),
      signature: z.string().max(200),
    }),
  ]),
});

export async function POST(request: Request) {
  return handle(async () => {
    const s = await requireSession();
    await rateLimit("relay", 10, 60_000, String(s.userId));
    const p = Body.safeParse(await request.json());
    if (!p.success) throw new HttpError(400, "Malformed request.");
    const signed = p.data.signed as SignedErc191 | SignedNep413;

    let claim;
    try {
      claim = parseWalletSigned(signed);
    } catch (e) {
      throw new HttpError(400, (e as Error).message);
    }
    const [pos] = await db()
      .select()
      .from(schema.positions)
      .where(and(eq(schema.positions.userId, s.userId), eq(schema.positions.accountId, claim.signer_id)));
    if (!pos) throw new HttpError(403, "That basket account isn't yours.");

    const one = claim.intents.length === 1 && claim.intents[0].intent === "add_public_key" ? claim.intents[0].public_key : null;
    if (!one || parsePublicKey(one).curve !== "ed25519") throw new HttpError(403, "Only adding one new browser key is allowed here.");

    const [user] = await db().select().from(schema.users).where(eq(schema.users.id, s.userId));
    if (!user.walletPubkey) throw new HttpError(400, "No wallet key on file. Sign in again.");
    const signer = await walletSignerKey(signed).catch(() => null);
    if (signer !== user.walletPubkey) throw new HttpError(403, "Signed by a different wallet key than the one you signed in with. Sign in again.");

    if (await hasPublicKey(pos.accountId, one)) return Response.json({ alreadyAdded: true });
    if (!(await hasPublicKey(pos.accountId, user.walletPubkey))) {
      throw new HttpError(409, "Your wallet isn't a recovery key on this basket account yet, so it can't add a new browser.");
    }
    try {
      const { txHash } = await relay([signed]);
      await db().insert(schema.auditLog).values({ actor: `user:${s.userId}`, action: "relay.authorize_device", target: pos.accountId, details: { txHash, key: one } });
      return Response.json({ txHash });
    } catch (e) {
      if (e instanceof RelayerNotConfigured) throw new HttpError(503, e.message);
      throw new HttpError(400, `The contract refused it: ${(e as Error).message.slice(0, 200)}`);
    }
  });
}
