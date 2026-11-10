// Which of a basket's assets 1Click will quote right now. A pair can stop quoting without warning (on 2026-11-10 every
// Ondo tokenized stock started answering "Quoting for this pair is not available"), and the basket page should say so
// before anyone fills in the buy form. Each asset is probed with a small dry quote and the answer is kept for 10 minutes.
import "server-only";
import { getAsset, USDC } from "@/lib/assets";
import { oneclick, OneClickError } from "@/lib/oneclick";

const TTL_MS = 10 * 60_000;
const cache = new Map<string, { at: number; ok: boolean | null }>();

/** true: quotes. false: 1Click refuses the pair. null: couldn't tell (network, rate limit); treated as fine. */
async function quotable(assetId: string): Promise<boolean | null> {
  const hit = cache.get(assetId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.ok;
  const a = getAsset(assetId);
  let ok: boolean | null;
  try {
    const probe = process.env.PLATFORM_FEE_ACCOUNT?.trim() || "intents.near";
    await oneclick.quote({
      dry: true,
      slippageTolerance: 100,
      originAsset: USDC.intentsAssetId,
      depositType: "INTENTS",
      destinationAsset: a.intentsAssetId,
      amount: String(Math.max(5, Math.ceil(a.minLegUsd)) * 1_000_000),
      recipient: probe,
      recipientType: "INTENTS",
      refundTo: probe,
      refundType: "INTENTS",
    });
    ok = true;
  } catch (e) {
    ok = e instanceof OneClickError && e.status >= 400 && e.status < 500 && /not available|no liquidity|not supported/i.test(e.message) ? false : null;
  }
  cache.set(assetId, { at: Date.now(), ok });
  return ok;
}

/** The basket's assets (our ids, e.g. "QQQ") that 1Click refuses to quote right now. USDC is always fine. */
export async function untradeable(assetIds: string[]): Promise<string[]> {
  const ids = assetIds.filter((id) => getAsset(id).kind !== "stable");
  const res = await Promise.all(ids.map((id) => quotable(id)));
  return ids.filter((_, i) => res[i] === false);
}
