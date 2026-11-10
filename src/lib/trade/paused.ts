// Wording and rules for assets NEAR Intents won't trade right now. Pure, so it is unit-tested; the live check is in
// availability.ts.

export interface Paused {
  cantBuy: string[];
  cantSell: string[];
}

/** Human list: "QQQ", "QQQ and HOOD", "QQQ, HOOD and TSLA". */
export const listOf = (ids: string[]) => (ids.length <= 1 ? (ids[0] ?? "") : `${ids.slice(0, -1).join(", ")} and ${ids[ids.length - 1]}`);

/** Why a basket can't be bought right now, or null. Selling must work too, or a buyer could get stuck. */
export function buyBlockReason(p: Paused): string | null {
  if (p.cantBuy.length) return `Buying ${listOf(p.cantBuy)} is paused on NEAR Intents right now, so this basket can't be bought. Try again later.`;
  if (p.cantSell.length)
    return `Selling ${listOf(p.cantSell)} is paused on NEAR Intents right now. Buying is paused too, so you can't end up holding something you can't sell. Try again later.`;
  return null;
}
