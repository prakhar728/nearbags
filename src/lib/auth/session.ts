// Session cookie: an HS256 JWT holding the user id and wallet. HttpOnly, 7 days.
import "server-only";
import { cookies } from "next/headers";
import { jwtVerify, SignJWT } from "jose";

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

export async function setSession(s: Session) {
  const token = await new SignJWT({ ...s })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return { userId: Number(payload.userId), chain: payload.chain as Session["chain"], address: String(payload.address) };
  } catch {
    return null;
  }
}

export async function clearSession() {
  (await cookies()).delete(COOKIE);
}

export async function requireSession(): Promise<Session> {
  const s = await getSession();
  if (!s) throw new HttpError(401, "Sign in first.");
  return s;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Wrap a route handler body: HttpError → its status, anything else → 500 with a short message. */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
    console.error(e);
    return Response.json({ error: (e as Error).message?.slice(0, 300) || "Server error" }, { status: 500 });
  }
}
