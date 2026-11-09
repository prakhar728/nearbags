// Explore filter buckets: stocks (stocks/ETFs, maybe cash), crypto (crypto, maybe cash), mixed (both).
import { getAsset } from "@/lib/assets";

export type BasketKind = "stocks" | "crypto" | "mixed";

export function basketKind(assets: { assetId: string }[]): BasketKind {
  const kinds = new Set(assets.map((a) => getAsset(a.assetId).kind));
  const eq = kinds.has("stock") || kinds.has("etf");
  const cr = kinds.has("crypto");
  return eq && cr ? "mixed" : cr ? "crypto" : "stocks";
}
