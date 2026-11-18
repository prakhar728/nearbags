// Pure part of gift-flows.ts, so it is unit-tested.
import { USDC } from "@/lib/assets";

const FUNDED = ["funded", "fees_paid", "legs_running", "complete", "partial"];

/** Holdings and money of one gift position, replayed from its buy orders (gift accounts never sell). */
export function replayGift(
  orders: { id: number; kind: string; status: string; grossUsdc: string | null; usdIn: number | null }[],
  legs: { orderId: number; status: string; assetFrom: string; assetTo: string; amountIn: string; amountOutActual: string | null }[],
  fees: { orderId: number; status: string; asset: string; amount: string }[],
): { units: [string, bigint][]; netUsd: number; paidUsd: number } {
  const u = new Map<string, bigint>();
  const add = (id: string, d: bigint) => u.set(id, (u.get(id) ?? 0n) + d);
  let net = 0n;
  let paid = 0;
  for (const o of orders) {
    if (o.kind !== "buy" || !FUNDED.includes(o.status) || !o.grossUsdc) continue;
    paid += o.usdIn ?? 0;
    let got = BigInt(o.grossUsdc);
    add(USDC.intentsAssetId, got);
    for (const f of fees.filter((f) => f.orderId === o.id && f.status === "success")) {
      add(f.asset, -BigInt(f.amount));
      if (f.asset === USDC.intentsAssetId) got -= BigInt(f.amount);
    }
    net += got;
    for (const l of legs.filter((l) => l.orderId === o.id && l.status === "success")) {
      if (l.assetFrom === l.assetTo) continue; // a USDC weight stays as it is
      add(l.assetFrom, -BigInt(l.amountIn));
      if (l.amountOutActual) add(l.assetTo, BigInt(l.amountOutActual));
    }
  }
  return { units: [...u].filter(([, v]) => v > 0n), netUsd: Number(net) / 1e6, paidUsd: paid };
}


/**
 * What a gift moved when it was claimed or taken back: `moved` (the tokens read from the relayed transfer) when we
 * have it, else, for gifts moved before we stored it, the holdings replayed from its orders.
 */
export function giftUnits(moved: [string, string][] | null | undefined, replayed: [string, bigint][]): [string, bigint][] {
  if (!moved) return replayed;
  return moved.map(([id, v]) => [id, BigInt(v)] as [string, bigint]).filter(([, v]) => v > 0n);
}
