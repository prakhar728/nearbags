// Insert the 5 seed baskets as House baskets owned by a "house" user (spec §11, Q20).
// Texts come from src/lib/seed-content.ts. Re-running updates text; weights change only while a basket has no holders.


// Usage: pnpm tsx --env-file=.env.local scripts/seed-baskets.ts
import { and, eq } from "drizzle-orm";
import { db, schema } from "../src/db";
import { SEED_BASKETS } from "../src/lib/seeds";
import { SEED_TEXT } from "../src/lib/seed-content";


/** Demo seeds (localOnly) go only into a database on this machine. */
function isLocalDb(): boolean {
  try {
    return ["localhost", "127.0.0.1", "::1"].includes(new URL(process.env.DATABASE_URL ?? "").hostname);
  } catch {
    return false;
  }
}

async function main() {
  const [house] = await db()
    .insert(schema.users)
    .values({ walletChain: "near", walletAddress: "stonkbag-house", handle: "stonkbag", bio: "House baskets.", isAdmin: true })
    .onConflictDoUpdate({ target: [schema.users.walletChain, schema.users.walletAddress], set: { handle: "stonkbag" } })
    .returning();

  for (const s of SEED_BASKETS) {
    if (s.localOnly && !isLocalDb()) {
      console.log(`${s.slug}: demo basket, skipped (database isn't local)`);
      continue;
    }
    const d = SEED_TEXT[s.slug];
    const [existing] = await db().select().from(schema.baskets).where(eq(schema.baskets.slug, s.slug));
    const text = { name: s.name, tagline: d.tagline, thesis: d.thesis, risks: d.risks, horizon: d.horizon, exitSignal: d.exitSignal };
    let id: number;
    if (existing) {
      id = existing.id;
      await db().update(schema.baskets).set(text).where(eq(schema.baskets.id, id));
      if (existing.status === "live") {
        for (const [assetId, why] of Object.entries(d.why)) {
          await db().update(schema.basketAssets).set({ why }).where(and(eq(schema.basketAssets.basketId, id), eq(schema.basketAssets.assetId, assetId)));
        }
        const cur = await db().select().from(schema.basketAssets).where(eq(schema.basketAssets.basketId, id));
        const same = cur.length === s.weights.length && s.weights.every((w) => cur.some((c) => c.assetId === w.assetId && c.weightBps === w.weightBps));
        const hasHolders = (await db().select().from(schema.positions).where(eq(schema.positions.basketId, id))).length > 0;
        if (same || hasHolders) {
          console.log(`${s.slug}: live, text updated${same ? "" : ", weights NOT changed (basket has holders)"}`);
          continue;
        }
        console.log(`${s.slug}: live with no holders, weights updated to seeds.ts`);
      }
      await db().delete(schema.basketAssets).where(eq(schema.basketAssets.basketId, id));
    } else {
      const [row] = await db()
        .insert(schema.baskets)
        .values({ slug: s.slug, creatorId: house.id, ...text, feeBps: 50, isHouse: !s.funded, status: "live", publishedAt: new Date() })
        .returning();
      id = row.id;
    }
    await db().insert(schema.basketAssets).values(s.weights.map((w) => ({ basketId: id, assetId: w.assetId, weightBps: w.weightBps, why: d.why[w.assetId] ?? "" })));
    console.log(`${s.slug}: id ${id}`);
  }
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
