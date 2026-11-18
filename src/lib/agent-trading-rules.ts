// Rules for agent keys that trade (plan feature 5). Pure, so they're unit-tested; lib/agent-trading.ts applies them.

export const AGENT_TRADE = { defaultDailyUsd: 100, maxDailyUsd: 1000, sellsPerDay: 5, buysPerHour: 20 } as const;

export interface TradeSettings {
  enabled: boolean;
  dailyUsd: number;
  anyBag: boolean;
  basketIds: number[];
}

/** Why this key can't trade this basket, or null. */
export function tradeProblem(t: TradeSettings, basketId: number): string | null {
  if (!t.enabled) return "Trading is off for this key. The owner can turn it on under Agent keys on their nearbags profile.";
  if (!t.anyBag && !t.basketIds.includes(basketId)) return "This key isn't allowed to trade that bag. The owner picks the bags under Agent keys on their profile.";
  return null;
}

const FINISHED = new Set(["complete", "failed", "refunded"]);
/** Leg statuses that mean a swap was sent to 1Click or Rhea, so money may already have moved. */
const SENT = new Set(["submitted", "success", "refunded", "failed"]);

/**
 * Why this key can't move an open order on (order_next, order_sign), or null. Turning trading off or dropping the bag
 * stops open orders, except a sell that already sent a swap: stopping it there would leave part of the bag as USDC in
 * the agent's account instead of in the owner's wallet. A sell only swaps toward USDC and pays out to the owner's
 * wallet, so letting it finish moves money away from the agent, never toward it. A finished order just reports.
 */
export function openOrderProblem(t: TradeSettings, basketId: number, order: { kind: string; status: string; legStatuses: string[] }): string | null {
  const why = tradeProblem(t, basketId);
  if (!why || FINISHED.has(order.status)) return null;
  if (order.kind === "sell" && order.legStatuses.some((s) => SENT.has(s))) return null;
  return why;
}

/** Why a buy of `usd` would break the key's daily limit, given what it bought in the last 24 hours, or null. */
export function limitProblem(t: TradeSettings, boughtTodayUsd: number, usd: number): string | null {
  const room = Math.max(0, t.dailyUsd - boughtTodayUsd);
  if (usd > room) return `That's over this key's daily limit of $${t.dailyUsd}: $${room.toFixed(2)} left for the next 24 hours.`;
  return null;
}

/** Owner input for the settings, cleaned. */
export function cleanSettings(p: { enabled: boolean; dailyUsd: number; anyBag: boolean; basketIds: number[] }): TradeSettings {
  const dailyUsd = Math.round(p.dailyUsd);
  if (!Number.isFinite(dailyUsd) || dailyUsd < 1 || dailyUsd > AGENT_TRADE.maxDailyUsd) throw new Error(`Daily limit: $1 to $${AGENT_TRADE.maxDailyUsd}.`);
  const ids = [...new Set(p.basketIds.filter((x) => Number.isInteger(x) && x > 0))].slice(0, 50);
  return { enabled: p.enabled, dailyUsd, anyBag: p.anyBag, basketIds: ids };
}

/** nearbags sends sale money to the owner's sign-in wallet, so the payout token must live on that wallet's chain. */
const EVM = new Set(["eth", "arb", "base", "op", "pol", "bsc"]);
export function payoutChainOk(walletChain: "near" | "evm", tokenChain: string): boolean {
  return walletChain === "near" ? tokenChain === "near" : EVM.has(tokenChain);
}
