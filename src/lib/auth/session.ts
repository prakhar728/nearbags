// Session cookie: an HS256 JWT holding the user id and wallet. HttpOnly, 7 days.
// Security audit 2026-11-18: the token carries typ "session", an audience and `sv` (users.session_version). Logout bumps
// the user's session_version, and requireSession() (what every route that changes data or moves money uses) checks
// `sv` against the database, so a logged-out token stops working there. getSession() skips that check (page loads).
import "server-only";
import { eq, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import { db, schema } from "@/db";
import { readSessionToken, signSessionToken } from "./session-token";

// Keep "sb_session" (from the old name, Stonkbag): renaming it would sign everyone out.
const COOKIE = "sb_session";
const MAX_AGE = 7 * 24 * 3600;

export interface Session {
  userId: number;
  chain: "near" | "evm";
  address: string;
}

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set (32+ chars)");
  return new TextEncoder().encode(s);
}

/** Start a session. `sv` is the user's current users.session_version. */
export async function setSession(s: Session & { sv: number }) {
  const token = await signSessionToken({ userId: s.userId, chain: s.chain, address: s.address, sv: s.sv }, secret(), MAX_AGE);
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

async function readCookie() {
  const token = (await cookies()).get(COOKIE)?.value;
  return token ? readSessionToken(token, secret()) : null;
}

/** The session from the cookie, without the revocation check: for reads only (page loads, "who am I"). */
export async function getSession(): Promise<Session | null> {
  const c = await readCookie();
  return c && { userId: c.userId, chain: c.chain, address: c.address };
}

/** Log out: revoke every session this user holds (bump session_version), then drop the cookie. */
export async function clearSession() {
  const c = await readCookie();
  if (c) await db().update(schema.users).set({ sessionVersion: sql`${schema.users.sessionVersion} + 1` }).where(eq(schema.users.id, c.userId));
  (await cookies()).delete(COOKIE);
}

/** The session, checked against the database: refused after a logout. Use for anything that writes or moves money. */
export async function requireSession(): Promise<Session> {
  const c = await readCookie();
  if (!c) throw new HttpError(401, "Sign in first.");
  const [u] = await db().select({ sv: schema.users.sessionVersion }).from(schema.users).where(eq(schema.users.id, c.userId));
  if (!u || u.sv !== c.sv) throw new HttpError(401, "Your session ended. Sign in again.");
  return { userId: c.userId, chain: c.chain, address: c.address };
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Wrap a route handler body: HttpError → its status and message, anything else → a generic 500 (detail in the logs). */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    unstable_rethrow(e); // let Next.js internals (prerender bail-outs, notFound, redirects) through
    if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
    console.error(e);
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  }
}
