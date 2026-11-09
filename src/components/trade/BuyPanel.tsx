"use client";
// Buy panel for a basket page. Owned by the trading track; the basket page only mounts it.
// Contract: <BuyPanel basket={{ id, slug, name, feeBps, minBuyUsd, status, assets }} />
import type { WeightInput } from "@/lib/trade/types";

export interface BuyPanelBasket {
  id: number;
  slug: string;
  name: string;
  feeBps: number;
  minBuyUsd: number;
  status: "draft" | "pending" | "live" | "closed" | "hidden";
  assets: WeightInput[];
}

export function BuyPanel({ basket }: { basket: BuyPanelBasket }) {
  if (basket.status !== "live") {
    return <div className="border border-border p-4 font-mono text-xs text-muted">Closed to new buyers.</div>;
  }
  return (
    <div className="border border-border p-4">
      <div className="font-mono text-[10px] uppercase tracking-wider text-faint">Buy</div>
      <div className="num mt-2 text-sm text-muted">Minimum ${basket.minBuyUsd}. Buying opens soon.</div>
    </div>
  );
}
