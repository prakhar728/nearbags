// Insert the 5 seed baskets as House baskets owned by a "house" user (spec §11, Q20).
// Theses are placeholders until Prakhar edits them (Day 4). Re-running updates text, never weights of a live basket.
// Usage: pnpm tsx --env-file=.env.local scripts/seed-baskets.ts
import { eq } from "drizzle-orm";
import { db, schema } from "../src/db";
import { SEED_BASKETS } from "../src/lib/seeds";

const DRAFT: Record<string, { tagline: string; thesis: string; risks: string; horizon: "3m" | "1y" | "3y+"; why: Record<string, string> }> = {
  "degen-mix": {
    tagline: "Tesla, Circle and two fast chains in one bag.",
    thesis: "Draft thesis. Prakhar edits this before launch.",
    risks: "Every asset here can drop 50% or more. Circle has little trading history.",
    horizon: "1y",
    why: { TSLA: "Draft.", CRCL: "Draft.", SOL: "Draft.", NEAR: "Draft." },
  },
  "ai-picks-and-shovels": {
    tagline: "The companies selling to the AI gold rush.",
    thesis: "Draft thesis. Prakhar edits this before launch.",
    risks: "Concentrated in one theme. AI spending can slow.",
    horizon: "3y+",
    why: { NVDA: "Draft.", MSFT: "Draft.", GOOGL: "Draft.", MRVL: "Draft.", META: "Draft." },
  },
  "gold-and-btc-hedge": {
    tagline: "Old money and new money against inflation.",
    thesis: "Draft thesis. Prakhar edits this before launch.",
    risks: "Neither gold nor bitcoin pays income. Both can fall together in a liquidity crunch.",
    horizon: "3y+",
    why: { GLD: "Draft.", SLV: "Draft.", BTC: "Draft." },
  },
  "big-tech-vs-bitcoin": {
    tagline: "Half Nasdaq, half crypto majors.",
    thesis: "Draft thesis. Prakhar edits this before launch.",
    risks: "Crypto and tech have moved together in sell-offs.",
    horizon: "3y+",
    why: { QQQ: "Draft.", BTC: "Draft.", ETH: "Draft." },
  },
  "yield-shelter": {
    tagline: "T-bills and inflation-linked bonds while you wait.",
    thesis: "Draft thesis. Prakhar edits this before launch.",
    risks: "Long bonds (TLT) fell hard in 2022 when rates rose.",
    horizon: "1y",
    why: { SGOV: "Draft.", TLT: "Draft.", TIP: "Draft.", USDC: "Draft." },
  },
};

async function main() {
  const [house] = await db()
    .insert(schema.users)
    .values({ walletChain: "near", walletAddress: "stonkbag-house", handle: "stonkbag", bio: "House baskets.", isAdmin: true })
    .onConflictDoUpdate({ target: [schema.users.walletChain, schema.users.walletAddress], set: { handle: "stonkbag" } })
    .returning();

  for (const s of SEED_BASKETS) {
    const d = DRAFT[s.slug];
    const [existing] = await db().select().from(schema.baskets).where(eq(schema.baskets.slug, s.slug));
    const text = { name: s.name, tagline: d.tagline, thesis: d.thesis, risks: d.risks, horizon: d.horizon };
    let id: number;
    if (existing) {
      id = existing.id;
      await db().update(schema.baskets).set(text).where(eq(schema.baskets.id, id));
      if (existing.status === "live") {
        console.log(`${s.slug}: live, text updated, weights untouched`);
        continue;
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
