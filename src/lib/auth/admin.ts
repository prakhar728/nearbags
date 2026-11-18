import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { HttpError, requireSession } from "./session";
import { isAdminUser } from "./admin-match";

export { isAdminUser, isAdminWallet } from "./admin-match";

/**
 * @deprecated Chain-blind: use isAdminUser(u). Kept for callers not yet moved over; returns the lowercased addresses of
 * ADMIN_WALLETS entries with any "near:"/"evm:" prefix left on, so a prefixed entry never matches here.
 */
export const adminWallets = () => (process.env.ADMIN_WALLETS ?? "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);

export async function requireAdmin() {
  const s = await requireSession();
  const [u] = await db().select().from(schema.users).where(eq(schema.users.id, s.userId));
  if (!u || !isAdminUser(u)) throw new HttpError(403, "Admins only.");
  return { session: s, user: u };
}
