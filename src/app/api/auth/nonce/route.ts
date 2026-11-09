import { lt } from "drizzle-orm";
import { db, schema } from "@/db";
import { bytesToB64, signInMessage } from "@/lib/auth/messages";
import { handle } from "@/lib/auth/session";

const TTL_MS = 5 * 60_000;

export async function POST(request: Request) {
  return handle(async () => {
    const nonce = bytesToB64(crypto.getRandomValues(new Uint8Array(32)));
    await db().delete(schema.authNonces).where(lt(schema.authNonces.expiresAt, Date.now()));
    await db().insert(schema.authNonces).values({ nonce, expiresAt: Date.now() + TTL_MS });
    return Response.json({ nonce, message: signInMessage(nonce, new URL(request.url).origin) });
  });
}
