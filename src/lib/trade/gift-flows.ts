// Gifts in a user's money history (found in the round 1 test, 2026-11-17). A gift's bag moves between accounts without
// any order on the receiving side, so P&L must be told about it, or a claimed gift shows as profit and a gift given
// away keeps counting as held.
//
//   received:  someone else's gift claimed into your own position. Counts as money in, at what went into the bag
//              (the buy's USDC after fees), so the gift itself isn't profit.
//   reclaimed: your own gift taken back into your own position. The money already went in when you bought the gift;
//              only the holding moves.
//   given:     your gift claimed by someone else. Counts as money out at what went into the bag, so you're left with
//              the fees, not a loss of the whole gift.
import "server-only";
import { and, eq, inArray, or } from "drizzle-orm";
import { db, schema } from "@/db";
import { giftUnits, replayGift } from "./gift-replay";

export type GiftFlowKind = "received" | "reclaimed" | "given";

export interface GiftFlow {
  kind: GiftFlowKind;
  at: Date;
  basketId: number;
  giftPositionId: number;
  /** USDC that went into the gift's bag (its buys after fees). */
  netUsd: number;
  /** What the sender paid for it (the buys' usdIn). */
  paidUsd: number;
  /** What moved (intents asset id → raw units): the stored transfer, or for older gifts, replayed from its orders. */
  units: [string, bigint][];
  senderUserId: number;
}

/** Every gift that moved into or out of this user's hands, oldest first. */
export async function giftFlows(userId: number): Promise<GiftFlow[]> {
  const gifts = await db()
    .select()
    .from(schema.gifts)
    .where(
      and(
        inArray(schema.gifts.status, ["claimed", "reclaimed"]),
        or(eq(schema.gifts.senderUserId, userId), eq(schema.gifts.claimedByUserId, userId)),
      ),
    );
  if (!gifts.length) return [];
  const posIds = gifts.map((g) => g.positionId);
  const orders = await db().select().from(schema.orders).where(inArray(schema.orders.positionId, posIds));
  const ids = orders.map((o) => o.id);
  const legs = ids.length ? await db().select().from(schema.orderLegs).where(inArray(schema.orderLegs.orderId, ids)) : [];
  const fees = ids.length ? await db().select().from(schema.feeEvents).where(inArray(schema.feeEvents.orderId, ids)) : [];

  const out: GiftFlow[] = [];
  for (const g of gifts) {
    const kind: GiftFlowKind | null =
      g.status === "reclaimed" ? (g.senderUserId === userId ? "reclaimed" : null) : g.claimedByUserId === userId ? "received" : g.senderUserId === userId ? "given" : null;
    if (!kind || !g.claimedAt) continue;
    const os = orders.filter((o) => o.positionId === g.positionId);
    const r = replayGift(os, legs, fees);
    out.push({
      kind,
      at: g.claimedAt,
      basketId: g.basketId,
      giftPositionId: g.positionId,
      netUsd: r.netUsd,
      paidUsd: r.paidUsd,
      units: giftUnits(g.moved, r.units),
      senderUserId: g.senderUserId,
    });
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}
