// Make a signed-in user the creator of the seed baskets and an admin (spec Q20: seeds publish under Prakhar's handle).
// Usage: pnpm claim-seeds <walletAddress> [handle]   (the wallet must have signed in once)
import { eq, ilike, inArray } from "drizzle-orm";
import { db, schema } from "../src/db";
import { SEED_BASKETS } from "../src/lib/seeds";

async function main() {
  const [address, handle] = process.argv.slice(2);
  if (!address) throw new Error("Usage: pnpm claim-seeds <walletAddress> [handle]");
  const [u] = await db().select().from(schema.users).where(ilike(schema.users.walletAddress, address));
  if (!u) throw new Error(`No user with wallet ${address}. Sign in on the site once first.`);
  await db().update(schema.users).set({ isAdmin: true, ...(handle ? { handle } : {}) }).where(eq(schema.users.id, u.id));
  const rows = await db().update(schema.baskets).set({ creatorId: u.id }).where(inArray(schema.baskets.slug, SEED_BASKETS.map((s) => s.slug))).returning();
  console.log(`${u.walletAddress} is now admin and creator of: ${rows.map((r) => r.slug).join(", ")}`);
  process.exit(0);
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
