// The session JWT itself, without cookies or the database (so it can be unit-tested). Security audit 2026-11-18:
// sessions carry typ "session" and an audience, are verified with HS256 only, and carry `sv` (users.session_version)
// so a logout can revoke them. Tokens without these claims (older sessions, P&L share tokens) are refused.
import { jwtVerify, SignJWT } from "jose";

export const SESSION_TYP = "session";
export const SESSION_AUD = "nearbags:session";

export interface SessionClaims {
  userId: number;
  chain: "near" | "evm";
  address: string;
  sv: number; // users.session_version when the session was made
}

export async function signSessionToken(c: SessionClaims, key: Uint8Array, maxAgeSec: number): Promise<string> {
  return new SignJWT({ typ: SESSION_TYP, userId: c.userId, chain: c.chain, address: c.address, sv: c.sv })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setAudience(SESSION_AUD)
    .setIssuedAt()
    .setExpirationTime(`${maxAgeSec}s`)
    .sign(key);
}

/** The claims of a valid session token, or null for anything else (bad signature, expired, wrong typ, share token…). */
export async function readSessionToken(token: string, key: Uint8Array): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"], audience: SESSION_AUD, requiredClaims: ["exp", "iat"] });
    if (payload.typ !== SESSION_TYP) return null;
    const { userId, chain, address, sv } = payload as Record<string, unknown>;
    if (typeof userId !== "number" || !Number.isInteger(userId) || userId <= 0) return null;
    if (typeof sv !== "number" || !Number.isInteger(sv) || sv < 0) return null;
    if (chain !== "near" && chain !== "evm") return null;
    if (typeof address !== "string" || !address) return null;
    return { userId, chain, address, sv };
  } catch {
    return null;
  }
}
