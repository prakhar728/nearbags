// Share links for a position's P&L. The link carries a signed snapshot (no database row): what the owner chose to
// share, frozen at the time they shared it.
//
// Security audit 2026-11-18: share tokens must never pass as sessions. New ones carry typ "share" and are signed with a
// key derived from SESSION_SECRET (HMAC-SHA256(SESSION_SECRET, "nearbags-share")), never SESSION_SECRET itself. Old ones
// (header typ "stonkbag-pnl", signed with SESSION_SECRET directly) are already posted publicly, so they still verify
// here as share tokens; sessions refuse both (session-token.ts needs typ "session" and an audience).
import "server-only";
import { jwtVerify, SignJWT } from "jose";
import { z } from "zod";

const Snapshot = z.object({
  v: z.literal(1),
  slug: z.string().max(80),
  name: z.string().max(80),
  assets: z.array(z.string().max(10)).max(12),
  pct: z.number(), // P&L as a fraction of money in, e.g. -0.019
  usd: z.number().nullable(), // P&L in USD, only when the owner opted in
  days: z.number().int().min(0), // days held (open) or from first buy to close (closed)
  state: z.enum(["open", "closed"]),
  by: z.string().max(80).nullable(), // creator-style handle or short wallet
  at: z.string(), // ISO time the snapshot was taken
});
export type PnlSnapshot = z.infer<typeof Snapshot>;

const SHARE_TYP = "share";
const LEGACY_TYP = "stonkbag-pnl"; // header typ of share links made before 2026-11-18

function sessionSecret(secret = process.env.SESSION_SECRET): Uint8Array {
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET must be set (32+ chars)");
  return new TextEncoder().encode(secret);
}

/** HMAC-SHA256(SESSION_SECRET, "nearbags-share"): the share-token key, separate from the session key. */
export async function shareKey(secret?: string): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey("raw", sessionSecret(secret) as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode("nearbags-share")));
}

export async function signSnapshot(s: PnlSnapshot, secret?: string): Promise<string> {
  return new SignJWT({ ...s, typ: SHARE_TYP }).setProtectedHeader({ alg: "HS256", typ: SHARE_TYP }).setIssuedAt().sign(await shareKey(secret));
}

export async function readSnapshot(token: string, secret?: string): Promise<PnlSnapshot | null> {
  // New: derived key, typ "share" in both header and payload.
  try {
    const { payload, protectedHeader } = await jwtVerify(token, await shareKey(secret), { algorithms: ["HS256"] });
    if (protectedHeader.typ !== SHARE_TYP || payload.typ !== SHARE_TYP) return null;
    const p = Snapshot.safeParse(payload);
    return p.success ? p.data : null;
  } catch {}
  // Old: SESSION_SECRET directly, header typ "stonkbag-pnl", no payload typ.
  try {
    const { payload, protectedHeader } = await jwtVerify(token, sessionSecret(secret), { algorithms: ["HS256"] });
    if (protectedHeader.typ !== LEGACY_TYP || payload.typ !== undefined) return null;
    const p = Snapshot.safeParse(payload);
    return p.success ? p.data : null;
  } catch {
    return null;
  }
}
