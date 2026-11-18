import { and, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { originFor, requestHost, signInHost } from "@/lib/auth/hosts";
import { signInMessage } from "@/lib/auth/messages";
import { handle, HttpError, setSession } from "@/lib/auth/session";
import { verifyEvmSignIn, verifyNearSignIn, type VerifiedWallet } from "@/lib/auth/verify";

const Body = z.discriminatedUnion("chain", [
  z.object({ chain: z.literal("near"), nonce: z.string().max(100), accountId: z.string().min(2).max(64), publicKey: z.string().max(200), signature: z.string().max(200) }),
  // `message` is the SIWE (EIP-4361) text the wallet signed; checked field by field in messages.ts.
  z.object({ chain: z.literal("evm"), nonce: z.string().max(100), address: z.string().max(64), message: z.string().max(2000), signature: z.string().max(1000).regex(/^0x[0-9a-fA-F]+$/) }),
]);

export async function POST(request: Request) {
  return handle(async () => {
    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, "Malformed sign-in request.");
    const b = parsed.data;
    // The host the signature must name (NEP-413 recipient / SIWE domain): one of ours, never the caller's choice.
    const host = signInHost(requestHost(request));
    if (!host) throw new HttpError(400, "Sign-in isn't available on this address. Use nearbags.com.");

    // One-time nonce: delete it now; a replay finds nothing.
    const used = await db()
      .delete(schema.authNonces)
      .where(and(eq(schema.authNonces.nonce, b.nonce), gt(schema.authNonces.expiresAt, Date.now())))
      .returning();
    if (!used.length) throw new HttpError(401, "Sign-in expired. Try again.");

    let wallet: VerifiedWallet;
    try {
      wallet =
        b.chain === "near"
          ? await verifyNearSignIn({ accountId: b.accountId, publicKey: b.publicKey, signature: b.signature, nonce: b.nonce, message: signInMessage(b.nonce, originFor(host)), host })
          : await verifyEvmSignIn({ address: b.address, signature: b.signature as `0x${string}`, message: b.message, host, nonce: b.nonce });
    } catch (e) {
      throw new HttpError(401, `Wallet signature didn't verify: ${(e as Error).message.split("\n")[0].slice(0, 160)}`);
    }

    const [user] = await db()
      .insert(schema.users)
      .values({ walletChain: wallet.chain, walletAddress: wallet.address, walletPubkey: wallet.publicKey })
      .onConflictDoUpdate({ target: [schema.users.walletChain, schema.users.walletAddress], set: { walletPubkey: wallet.publicKey } })
      .returning();
    await setSession({ userId: user.id, chain: wallet.chain, address: wallet.address, sv: user.sessionVersion });
    return Response.json({ user: { id: user.id, chain: user.walletChain, address: user.walletAddress, handle: user.handle, keyMode: user.keyMode } });
  });
}
