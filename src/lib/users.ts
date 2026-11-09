// User lookups for route handlers (server only).
import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { HttpError, type Session } from "@/lib/auth/session";

export type UserRow = typeof schema.users.$inferSelect;

export function adminWallets(): string[] {
  return (process.env.ADMIN_WALLETS ?? "")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
}

export const isAdmin = (u: UserRow) => u.isAdmin || adminWallets().includes(u.walletAddress.toLowerCase());

export async function sessionUser(s: Session): Promise<UserRow> {
  const [u] = await db().select().from(schema.users).where(eq(schema.users.id, s.userId));
  if (!u) throw new HttpError(401, "Sign in again.");
  return u;
}

/** The basket row at `slug`, if `userId` created it. 404 / 403 otherwise. */
export async function loadOwnBasket(slug: string, userId: number) {
  const [b] = await db().select().from(schema.baskets).where(eq(schema.baskets.slug, slug));
  if (!b || b.status === "draft") throw new HttpError(404, "No basket at that link.");
  if (b.creatorId !== userId) throw new HttpError(403, "Only the creator can change this basket.");
  return b;
}
