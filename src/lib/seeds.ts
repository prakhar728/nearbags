// Launch seed baskets (spec §11). Theses are drafted later and edited by Prakhar before publishing.
import type { WeightInput } from "@/lib/analytics/basket";

export interface SeedBasket {
  slug: string;
  name: string;
  funded: boolean; // false = House basket (admin exemption from self-buy)
  weights: WeightInput[];
  /** Demo only: scripts/seed-baskets.ts inserts it into a local database, never a remote one. */
  localOnly?: boolean;
}

const w = (pairs: [string, number][]): WeightInput[] => pairs.map(([assetId, pct]) => ({ assetId, weightBps: pct * 100 }));

export const SEED_BASKETS: SeedBasket[] = [
  { slug: "degen-mix", name: "Degen Mix", funded: true, weights: w([["TSLA", 30], ["CRCL", 25], ["SOL", 25], ["NEAR", 20]]) },
  { slug: "ai-picks-and-shovels", name: "AI Picks & Shovels", funded: false, weights: w([["NVDA", 30], ["MSFT", 20], ["GOOGL", 20], ["MRVL", 15], ["META", 15]]) },
  { slug: "gold-and-btc-hedge", name: "Gold & BTC Hedge", funded: false, weights: w([["GLD", 40], ["SLV", 20], ["BTC", 40]]) },
  { slug: "big-tech-vs-bitcoin", name: "Big Tech vs Bitcoin", funded: false, weights: w([["QQQ", 50], ["BTC", 30], ["ETH", 20]]) },
  { slug: "near-memes", name: "NEAR Memes", funded: false, localOnly: true, weights: w([["HOOT", 50], ["NEARLY", 50]]) },
  { slug: "yield-shelter", name: "Yield Shelter", funded: false, weights: w([["SGOV", 40], ["TLT", 25], ["TIP", 25], ["USDC", 10]]) },
];
