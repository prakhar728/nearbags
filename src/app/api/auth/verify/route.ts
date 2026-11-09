import { and, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { signInMessage } from "@/lib/auth/messages";
import { handle, HttpError, setSession } from "@/lib/auth/session";
import { verifyEvmSignIn, verifyNearSignIn, type VerifiedWallet } from "@/lib/auth/verify";

const Body = z.discriminatedUnion("chain", [
  z.object({ chain: z.literal("near"), nonce: z.string(), accountId: z.string().min(2).max(64), publicKey: z.string(), signature: z.string() }),
  z.object({ chain: z.literal("evm"), nonce: z.string(), address: z.string(), signature: z.string().regex(/^0x[0-9a-fA-F]+$/) }),
]);

export async function POST(request: Request) {
  return handle(async () => {
    const parsed = Body.safeParse(await request.json());
    if (!parsed.success) throw new HttpError(400, "Malformed sign-in request.");
    const b = parsed.data;

    // One-time nonce: delete it now; a replay finds nothing.
    const used = await db()
      .delete(schema.authNonces)
      .where(and(eq(schema.authNonces.nonce, b.nonce), gt(schema.authNonces.expiresAt, Date.now())))
      .returning();
    if (!used.length) throw new HttpError(401, "Sign-in expired. Try again.");

    const message = signInMessage(b.nonce, new URL(request.url).origin);
    let wallet: VerifiedWallet;
    try {
      wallet =
        b.chain === "near"
          ? await verifyNearSignIn({ accountId: b.accountId, publicKey: b.publicKey, signature: b.signature, nonce: b.nonce, message })
          : await verifyEvmSignIn({ address: b.address, signature: b.signature as `0x${string}`, message });
    } catch (e) {
      throw new HttpError(401, `Wallet signature didn't verify: ${(e as Error).message.slice(0, 160)}`);
    }

    const [user] = await db()
      .insert(schema.users)
      .values({ walletChain: wallet.chain, walletAddress: wallet.address, walletPubkey: wallet.publicKey })
      .onConflictDoUpdate({ target: [schema.users.walletChain, schema.users.walletAddress], set: { walletPubkey: wallet.publicKey } })
      .returning();
    await setSession({ userId: user.id, chain: wallet.chain, address: wallet.address });
    return Response.json({ user: { id: user.id, chain: user.walletChain, address: user.walletAddress, handle: user.handle, keyMode: user.keyMode } });
  });
}
