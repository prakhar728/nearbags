// Explore filter buckets: stocks (stocks/ETFs, maybe cash), crypto (crypto, maybe cash), mixed (both), meme (any meme coin).
import { getAsset } from "@/lib/assets";

export type BasketKind = "stocks" | "crypto" | "mixed" | "meme";

export function basketKind(assets: { assetId: string }[]): BasketKind {
  const kinds = new Set(assets.map((a) => getAsset(a.assetId).kind));
  if (kinds.has("meme")) return "meme";
  const eq = kinds.has("stock") || kinds.has("etf");
  const cr = kinds.has("crypto");
  return eq && cr ? "mixed" : cr ? "crypto" : "stocks";
}

/** Any meme coin in these weights (for the risk notice). */
export const hasMeme = (assets: { assetId: string }[]) => assets.some((a) => getAsset(a.assetId).kind === "meme");
