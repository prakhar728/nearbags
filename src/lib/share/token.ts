// Share links for a position's P&L. The link carries a signed snapshot (no database row): what the owner chose to
// share, frozen at the time they shared it. Signed with SESSION_SECRET under a separate "typ" so it can never be used
// as a session.
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

function key() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set (32+ chars)");
  return new TextEncoder().encode(s);
}

// Keep typ "stonkbag-pnl": share links already signed with it must keep verifying after the rename to nearbags.
export async function signSnapshot(s: PnlSnapshot): Promise<string> {
  return new SignJWT({ ...s }).setProtectedHeader({ alg: "HS256", typ: "stonkbag-pnl" }).setIssuedAt().sign(key());
}

export async function readSnapshot(token: string): Promise<PnlSnapshot | null> {
  try {
    const { payload, protectedHeader } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    if (protectedHeader.typ !== "stonkbag-pnl") return null;
    const p = Snapshot.safeParse(payload);
    return p.success ? p.data : null;
  } catch {
    return null;
  }
}
