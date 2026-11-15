// Rules for agent keys that trade (plan feature 5). Pure, so they're unit-tested; lib/agent-trading.ts applies them.

export const AGENT_TRADE = { defaultDailyUsd: 100, maxDailyUsd: 1000, sellsPerDay: 5 } as const;

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

/** Sale money only goes to the owner's sign-in wallet, so the payout token must live on that wallet's chain. */
const EVM = new Set(["eth", "arb", "base", "op", "pol", "bsc"]);
export function payoutChainOk(walletChain: "near" | "evm", tokenChain: string): boolean {
  return walletChain === "near" ? tokenChain === "near" : EVM.has(tokenChain);
}
