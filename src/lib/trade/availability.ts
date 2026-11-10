// Can each asset be traded through NEAR Intents (1Click) right now, in each direction?
//
// Nobody publishes this. Ondo's own status page can say "operational" while 1Click's market makers refuse to quote
// its tokens: on 2026-11-10 every Ondo stock answered "Quoting for this pair is not available" for two hours, then
// buys came back while sells kept answering "No liquidity available". So we ask 1Click ourselves: a small dry quote
// USDC → asset (buy) and asset → USDC (sell, sized from the buy quote), kept for 10 minutes.
//
// Meme coins trade on Rhea instead: the same two-sided check runs against the DCL contract's quote view, and an
// upgradable token (HOOT) also has to still be the contract we checked (no transfer fee, same code), or buys pause.
import "server-only";
import { ASSETS, getAsset, USDC } from "@/lib/assets";
import { oneclick, OneClickError } from "@/lib/oneclick";
import { quoteLeg, RheaNoLiquidity, tokenSafety } from "@/lib/rhea";
import type { Paused } from "./paused";
export { buyBlockReason, listOf, venueOf, type Paused } from "./paused";

const TTL_MS = 10 * 60_000;

/** true: quotes. false: 1Click refuses it. null: couldn't tell (network, rate limit), treated as fine. */
export type Side = boolean | null;
export interface Tradability {
  buy: Side;
  sell: Side;
  why?: string; // we paused it ourselves (meme coin safety check)
}

const cache = new Map<string, { at: number; t: Promise<Tradability> }>();

const refused = (e: unknown) =>
  e instanceof OneClickError && e.status >= 400 && e.status < 500 && /not available|no liquidity|not supported|no route/i.test(e.message);

/** Rhea: $5 USDC → meme, then sell those units back. A 0 quote means no liquidity; an RPC error means "can't tell". */
async function probeRhea(assetId: string): Promise<Tradability> {
  const a = getAsset(assetId);
  const side = async (fn: () => Promise<unknown>): Promise<Side> => {
    try {
      await fn();
      return true;
    } catch (e) {
      return e instanceof RheaNoLiquidity ? false : null;
    }
  };
  let units: string | null = null;
  const buy = await side(async () => (units = (await quoteLeg("USDC", a.id, String(Math.max(5, a.minLegUsd) * 1_000_000))).amountOut));
  const sell = units ? await side(() => quoteLeg(a.id, "USDC", units!)) : null;
  const safety = await tokenSafety(a.id).catch(() => ({ ok: false, reason: `${a.id}: couldn't check its contract.` }));
  if (!safety.ok) return { buy: false, sell, why: safety.reason };
  return { buy, sell };
}

async function probe(assetId: string): Promise<Tradability> {
  const a = getAsset(assetId);
  if (a.venue === "rhea") return probeRhea(assetId);
  const account = process.env.PLATFORM_FEE_ACCOUNT?.trim() || "intents.near";
  const leg = { dry: true, slippageTolerance: 100, depositType: "INTENTS", recipient: account, recipientType: "INTENTS", refundTo: account, refundType: "INTENTS" } as const;
  let buy: Side = null;
  let units: string | null = null;
  try {
    const q = await oneclick.quote({ ...leg, originAsset: USDC.intentsAssetId, destinationAsset: a.intentsAssetId, amount: String(Math.max(5, Math.ceil(a.minLegUsd)) * 1_000_000) });
    buy = true;
    units = q.quote.amountOut;
  } catch (e) {
    buy = refused(e) ? false : null;
  }
  if (!units) {
    // No buy quote to size the sell from: use the token list's price.
    const t = (await oneclick.tokens({ ondo: true }).catch(() => [])).find((x) => x.assetId === a.intentsAssetId);
    if (t?.price) units = String(BigInt(Math.floor((Math.max(5, a.minLegUsd) / t.price) * 10 ** Math.min(a.decimals, 12))) * 10n ** BigInt(Math.max(0, a.decimals - 12)));
  }
  let sell: Side = null;
  if (units && BigInt(units) > 0n) {
    try {
      await oneclick.quote({ ...leg, originAsset: a.intentsAssetId, destinationAsset: USDC.intentsAssetId, amount: units });
      sell = true;
    } catch (e) {
      sell = refused(e) ? false : null;
    }
  }
  return { buy, sell };
}

/** Buy/sell status for these assets (our ids, e.g. "QQQ"). USDC always trades. */
export async function tradability(assetIds: string[]): Promise<Record<string, Tradability>> {
  const out: Record<string, Tradability> = {};
  await Promise.all(
    [...new Set(assetIds)].map(async (id) => {
      if (getAsset(id).kind === "stable") return void (out[id] = { buy: true, sell: true });
      let hit = cache.get(id);
      if (!hit || Date.now() - hit.at > TTL_MS) {
        hit = { at: Date.now(), t: probe(id).catch(() => ({ buy: null, sell: null })) };
        cache.set(id, hit);
      }
      out[id] = await hit.t;
    }),
  );
  return out;
}

/** Which of these assets can't be bought, and which can't be sold, right now (1Click or Rhea). */
export async function paused(assetIds: string[]): Promise<Paused> {
  const t = await tradability(assetIds);
  const ids = Object.keys(t);
  const why = Object.fromEntries(ids.filter((id) => t[id].why).map((id) => [id, t[id].why!]));
  return { cantBuy: ids.filter((id) => t[id].buy === false), cantSell: ids.filter((id) => t[id].sell === false), ...(Object.keys(why).length ? { why } : {}) };
}

/** Every asset on the approved list, for the site-wide notice. */
export const pausedAcrossList = () => paused(ASSETS.map((a) => a.id));

/** Kept for callers from before the two-sided check. */
export async function untradeable(assetIds: string[]): Promise<string[]> {
  const p = await paused(assetIds);
  return [...new Set([...p.cantBuy, ...p.cantSell])];
}
