// Wording and rules for assets that can't be traded right now. Pure, so it is unit-tested; the live check is in
// availability.ts. Most assets trade through NEAR Intents (1Click); meme coins trade on Rhea.
import { isMeme } from "@/lib/assets";

export interface Paused {
  cantBuy: string[];
  cantSell: string[];
  /** Plain reason per asset when we paused it ourselves (e.g. a meme coin's contract changed). */
  why?: Record<string, string>;
}

/** Human list: "QQQ", "QQQ and HOOD", "QQQ, HOOD and TSLA". */
export const listOf = (ids: string[]) => (ids.length <= 1 ? (ids[0] ?? "") : `${ids.slice(0, -1).join(", ")} and ${ids[ids.length - 1]}`);

/** Where these assets trade: "NEAR Intents", "Rhea", or both. */
export function venueOf(ids: string[]): string {
  const rhea = ids.some(isMeme);
  const intents = ids.some((id) => !isMeme(id));
  return rhea && intents ? "NEAR Intents and Rhea" : rhea ? "Rhea" : "NEAR Intents";
}

/** Why a basket can't be bought right now, or null. Selling must work too, or a buyer could get stuck. */
export function buyBlockReason(p: Paused): string | null {
  const why = Object.entries(p.why ?? {}).filter(([id]) => p.cantBuy.includes(id));
  if (why.length) return `Buying ${listOf(why.map(([id]) => id))} is paused: ${why.map(([, w]) => w).join(" ")} Holders can still sell.`;
  if (p.cantBuy.length) return `Buying ${listOf(p.cantBuy)} is paused on ${venueOf(p.cantBuy)} right now, so this basket can't be bought. Try again later.`;
  if (p.cantSell.length)
    return `Selling ${listOf(p.cantSell)} is paused on ${venueOf(p.cantSell)} right now. Buying is paused too, so you can't end up holding something you can't sell. Try again later.`;
  return null;
}
