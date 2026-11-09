// Preflight (spec §5.4 step 1, Q11): before any money moves, quote every leg and run the price guard.
// Any leg that can't quote or is blocked → the whole buy is blocked.
import "server-only";
import { getAsset, USDC } from "@/lib/assets";
import { oneclick, OneClickError } from "@/lib/oneclick";
import { livePrice } from "@/lib/prices/live";
import { guard, usSession, type GuardResult } from "./guard";

export const SLIPPAGE_BPS = 100; // Q11: 1% max per leg
const QUOTE_CONCURRENCY = 4;
// Any well-formed implicit account works as the recipient of a dry quote.
const DRY_ACCOUNT = "0".repeat(63) + "1";

import type { WeightInput } from "./types";
export type { WeightInput };

export interface LegPlan {
  assetId: string;
  weightBps: number;
  usdcIn: string; // smallest units (6 decimals)
}

export interface LegCheck extends LegPlan {
  ok: boolean;
  reason?: string; // human-readable why it can't trade
  amountOut?: string;
  amountOutFormatted?: string;
  amountOutUsd?: number;
  guard?: GuardResult;
  priceDisagreement?: number; // stocks: indicative vs underlying × multiplier
}

export interface FeeSplit {
  grossUsdc: bigint;
  creatorFee: bigint;
  platformFee: bigint;
  netUsdc: bigint;
}

/** Fees are taken from the USDC that landed in the basket account, before legs (spec Q10). Rounded down. */
export function splitFees(grossUsdc: bigint, creatorFeeBps: number, platformFeeBps: number): FeeSplit {
  const creatorFee = (grossUsdc * BigInt(creatorFeeBps)) / 10_000n;
  const platformFee = (grossUsdc * BigInt(platformFeeBps)) / 10_000n;
  return { grossUsdc, creatorFee, platformFee, netUsdc: grossUsdc - creatorFee - platformFee };
}

/** Split net USDC across weights; the last leg takes the rounding remainder so nothing is left behind. */
export function planLegs(netUsdc: bigint, weights: WeightInput[]): LegPlan[] {
  let used = 0n;
  return weights.map((w, i) => {
    const amt = i === weights.length - 1 ? netUsdc - used : (netUsdc * BigInt(w.weightBps)) / 10_000n;
    used += amt;
    return { assetId: w.assetId, weightBps: w.weightBps, usdcIn: amt.toString() };
  });
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

export async function checkBuyLegs(legs: LegPlan[], account = DRY_ACCOUNT): Promise<LegCheck[]> {
  const session = usSession();
  return mapLimit(legs, QUOTE_CONCURRENCY, async (leg): Promise<LegCheck> => {
    const asset = getAsset(leg.assetId);
    if (asset.id === "USDC") {
      return { ...leg, ok: true, amountOut: leg.usdcIn, amountOutUsd: Number(leg.usdcIn) / 1e6 };
    }
    try {
      const [q, ref] = await Promise.all([
        oneclick.quote({
          dry: true,
          slippageTolerance: SLIPPAGE_BPS,
          originAsset: USDC.intentsAssetId,
          depositType: "INTENTS",
          destinationAsset: asset.intentsAssetId,
          amount: leg.usdcIn,
          recipient: account,
          recipientType: "INTENTS",
          refundTo: account,
          refundType: "INTENTS",
        }),
        livePrice(asset.id),
      ]);
      const usd = Number(leg.usdcIn) / 1e6;
      const units = Number(q.quote.amountOut) / 10 ** asset.decimals;
      const g = guard({ side: "buy", usd, units, referencePrice: ref.price, kind: asset.kind, session });
      const reason =
        g.verdict === "block"
          ? `${asset.id} is quoting ${(g.deviation * 100).toFixed(1)}% above the market price right now.`
          : undefined;
      return {
        ...leg,
        ok: g.verdict !== "block",
        reason,
        amountOut: q.quote.amountOut,
        amountOutFormatted: q.quote.amountOutFormatted,
        amountOutUsd: Number(q.quote.amountOutUsd),
        guard: g,
        priceDisagreement: ref.disagreement,
      };
    } catch (e) {
      const msg =
        e instanceof OneClickError && e.noLiquidity
          ? `${asset.id} isn't tradable right now (no liquidity).`
          : `${asset.id} couldn't be quoted: ${(e as Error).message.slice(0, 160)}`;
      return { ...leg, ok: false, reason: msg };
    }
  });
}

export interface BuyPreflight {
  ok: boolean;
  session: ReturnType<typeof usSession>;
  fees: { grossUsdc: string; creatorFee: string; platformFee: string; netUsdc: string };
  legs: LegCheck[];
  blockedBy: string[];
  warnings: string[];
  estValueUsd: number; // what the buyer ends up holding, per the quotes
}

export async function preflightBuy(params: {
  weights: WeightInput[];
  grossUsdc: bigint; // USDC expected in the basket account after funding
  creatorFeeBps: number;
  platformFeeBps: number;
  account?: string;
}): Promise<BuyPreflight> {
  const fees = splitFees(params.grossUsdc, params.creatorFeeBps, params.platformFeeBps);
  const legs = await checkBuyLegs(planLegs(fees.netUsdc, params.weights), params.account);
  const blockedBy = legs.filter((l) => !l.ok).map((l) => l.reason ?? `${l.assetId} unavailable`);
  const warnings = legs
    .filter((l) => l.ok && l.guard?.verdict === "warn")
    .map((l) => `${l.assetId} is ${(l.guard!.deviation * 100).toFixed(1)}% above the market price.`);
  return {
    ok: blockedBy.length === 0,
    session: usSession(),
    fees: {
      grossUsdc: fees.grossUsdc.toString(),
      creatorFee: fees.creatorFee.toString(),
      platformFee: fees.platformFee.toString(),
      netUsdc: fees.netUsdc.toString(),
    },
    legs,
    blockedBy,
    warnings,
    estValueUsd: legs.reduce((s, l) => s + (l.amountOutUsd ?? 0), 0),
  };
}
