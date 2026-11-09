// Basket construction rules (spec Q5), shared by the creator studio (client) and the API (server).
import { ASSETS, getAsset } from "@/lib/assets";
import type { WeightInput } from "@/lib/trade/types";

export const RULES = {
  minAssets: 2,
  maxAssets: 10,
  minWeightBps: 500,
  maxWeightBps: 5000,
  weightStepBps: 100, // whole percents
  minBuyFloorUsd: 20,
  maxBuyUsd: 1000,
  maxCreatorFeeBps: 100,
  creatorFeeStepBps: 5,
} as const;

/**
 * Smallest buy (in USD paid in) at which every leg clears its asset's minimum swap size,
 * after creator + platform fees come off the top. Rounded up to the next $5.
 */
export function minBuyUsd(weights: WeightInput[], feeBps: number): number {
  const keep = 1 - feeBps / 10_000;
  const need = weights.reduce<number>((m, w) => {
    const a = getAsset(w.assetId);
    return a.minLegUsd > 0 ? Math.max(m, a.minLegUsd / ((w.weightBps / 10_000) * keep)) : m;
  }, RULES.minBuyFloorUsd);
  return Math.ceil(need / 5) * 5;
}

export function validateWeights(weights: WeightInput[]): string[] {
  const errs: string[] = [];
  const ids = new Set(ASSETS.map((a) => a.id));
  if (weights.length < RULES.minAssets) errs.push(`Pick at least ${RULES.minAssets} assets.`);
  if (weights.length > RULES.maxAssets) errs.push(`Pick at most ${RULES.maxAssets} assets.`);
  const seen = new Set<string>();
  for (const w of weights) {
    if (!ids.has(w.assetId)) errs.push(`${w.assetId} is not on the approved list.`);
    if (seen.has(w.assetId)) errs.push(`${w.assetId} appears twice.`);
    seen.add(w.assetId);
    if (w.weightBps % RULES.weightStepBps) errs.push(`${w.assetId}: use whole percents.`);
    if (w.weightBps < RULES.minWeightBps || w.weightBps > RULES.maxWeightBps) errs.push(`${w.assetId}: weight must be 5–50%.`);
  }
  const sum = weights.reduce((s, w) => s + w.weightBps, 0);
  if (sum !== 10_000) errs.push(`Weights add up to ${sum / 100}%, not 100%.`);
  return errs;
}
