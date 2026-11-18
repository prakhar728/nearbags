import { rateLimit } from "@/lib/ratelimit";
import { lt } from "drizzle-orm";
import { db, schema } from "@/db";
import { originFor, requestHost, signInHost } from "@/lib/auth/hosts";
import { bytesToB64, nearSignInRecipient, signInMessage } from "@/lib/auth/messages";
import { handle, HttpError } from "@/lib/auth/session";

const TTL_MS = 5 * 60_000;

// A fresh single-use nonce, plus the host the wallet must sign for: the NEP-413 recipient for NEAR, the SIWE domain for
// EVM (the client builds the SIWE text from these; see messages.ts).
export async function POST(request: Request) {
  return handle(async () => {
    const host = signInHost(requestHost(request));
    if (!host) throw new HttpError(400, "Sign-in isn't available on this address. Use nearbags.com.");
    await rateLimit("nonce", 20, 60_000);
    const nonce = bytesToB64(crypto.getRandomValues(new Uint8Array(32)));
    await db().delete(schema.authNonces).where(lt(schema.authNonces.expiresAt, Date.now()));
    await db().insert(schema.authNonces).values({ nonce, expiresAt: Date.now() + TTL_MS });
    return Response.json({ nonce, host, recipient: nearSignInRecipient(host), message: signInMessage(nonce, originFor(host)) });
  });
}
