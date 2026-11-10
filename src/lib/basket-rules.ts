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

/** The most an AI agent may move one asset to (the strategist's hard cap, agent/strategist/src/policy.rs). */
export const AGENT_MAX_WEIGHT_BPS = 8000;

/**
 * `maxWeightBps` defaults to the creation rule (50%). Buying a live basket passes AGENT_MAX_WEIGHT_BPS, since an
 * agent-managed basket's targets can move past 50% after it was created.
 */
export function validateWeights(weights: WeightInput[], opts: { maxWeightBps?: number } = {}): string[] {
  const maxBps = opts.maxWeightBps ?? RULES.maxWeightBps;
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
    if (w.weightBps < RULES.minWeightBps || w.weightBps > maxBps) errs.push(`${w.assetId}: weight must be ${RULES.minWeightBps / 100}–${maxBps / 100}%.`);
  }
  const sum = weights.reduce((s, w) => s + w.weightBps, 0);
  if (sum !== 10_000) errs.push(`Weights add up to ${sum / 100}%, not 100%.`);
  const mix = memeMixProblem(weights.map((w) => w.assetId));
  if (mix) errs.push(mix);
  return errs;
}

/**
 * Meme coins mix with crypto and cash, not with stocks or ETFs. They trade on Rhea around the clock, while tokenized
 * stocks pause outside US market hours: a basket holding both could be half-bought (or half-sold) for a weekend.
 * And a "safe" stock basket shouldn't quietly carry meme-coin risk.
 */
export function memeMixProblem(assetIds: string[]): string | null {
  const known = assetIds.filter((id) => ASSETS.some((a) => a.id === id)).map(getAsset);
  const memes = known.filter((a) => a.kind === "meme");
  const stocks = known.filter((a) => a.kind === "stock" || a.kind === "etf");
  if (!memes.length || !stocks.length) return null;
  return "Meme coins can't share a basket with stocks or ETFs: they trade on a different venue and schedule, so a buy could stall half done. Pair them with crypto or USDC.";
}

/** Agent-managed baskets can't hold meme coins yet: the agent's signer only signs 1Click swaps. */
export function agentAssetProblem(assetIds: string[]): string | null {
  const memes = assetIds.filter((id) => ASSETS.some((a) => a.id === id && a.kind === "meme"));
  return memes.length ? `The agent can't manage meme coins yet (${memes.join(", ")}): its signer only checks NEAR Intents swaps. Remove them or turn the agent off.` : null;
}
