import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { HttpError, requireSession } from "./session";

export const adminWallets = () => (process.env.ADMIN_WALLETS ?? "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);

export async function requireAdmin() {
  const s = await requireSession();
  const [u] = await db().select().from(schema.users).where(eq(schema.users.id, s.userId));
  if (!u || !(u.isAdmin || adminWallets().includes(u.walletAddress.toLowerCase()))) throw new HttpError(403, "Admins only.");
  return { session: s, user: u };
}
