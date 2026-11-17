// Gift rules (plan feature 2), pure so they're unit-tested. lib/gifts.ts does the database and chain work.
import type { Intent } from "@/lib/intents/payload";

export const GIFT = { minDays: 7, maxDays: 90, defaultDays: 30, messageMax: 280 } as const;

export type GiftStatus = "funding" | "ready" | "claimed" | "reclaimed" | "cancelled";
export type TransferMode = "claim" | "reclaim";

/** What a visitor sees: the stored status, plus "expired" for a ready gift past its date. */
export function shownStatus(g: { status: GiftStatus; expiresAt: Date }, now = new Date()): GiftStatus | "expired" {
  return g.status === "ready" && now > g.expiresAt ? "expired" : g.status;
}

/** Why this gift can't be claimed (by someone other than the sender) right now, or null. */
export function claimProblem(g: { status: GiftStatus; expiresAt: Date; senderUserId: number }, claimerId: number, now = new Date()): string | null {
  if (g.senderUserId === claimerId) return "This is your own gift. You can take it back from your portfolio instead.";
  switch (shownStatus(g, now)) {
    case "funding":
      return "This gift hasn't been paid for yet. Try again in a few minutes.";
    case "claimed":
      return "This gift has already been claimed.";
    case "reclaimed":
      return "The sender took this gift back.";
    case "cancelled":
      return "The sender cancelled this gift before paying for it.";
    case "expired":
      return "This gift expired. It stays with the sender.";
    default:
      return null;
  }
}

/**
 * Why the sender can't take it back right now, or null. Funding is fine: whatever arrived so far comes back. So is
 * cancelled: the deposit address outlives the cancel, and money that still arrives must be recoverable.
 */
export function reclaimProblem(g: { status: GiftStatus; senderUserId: number }, userId: number): string | null {
  if (g.senderUserId !== userId) return "Only the sender can take a gift back.";
  if (g.status === "claimed") return "It was already claimed.";
  if (g.status === "reclaimed") return "You already took it back.";
  return null;
}

/** The one intent a claim or take-back signs: every non-zero balance on the gift account, to one receiver. */
export function transferAll(receiver: string, balances: Record<string, string>): Intent[] {
  const tokens = Object.fromEntries(Object.entries(balances).filter(([, v]) => BigInt(v) > 0n));
  if (!Object.keys(tokens).length) throw new Error("This gift's account is empty.");
  return [{ intent: "transfer", receiver_id: receiver, tokens, memo: "nearbags gift" }];
}

/** Same intents, ignoring key order inside token maps. */
export function sameIntents(a: Intent[], b: Intent[]): boolean {
  const norm = (xs: Intent[]) =>
    JSON.stringify(
      xs.map((x) =>
        x.intent === "transfer" ? { i: x.intent, r: x.receiver_id, t: Object.entries(x.tokens).sort(([p], [q]) => p.localeCompare(q)), m: x.memo ?? null } : x,
      ),
    );
  return norm(a) === norm(b);
}

/** Public code in the gift link: 12 characters, unguessable enough that links can't be enumerated. */
export function giftCode(random: (n: number) => Uint8Array): string {
  const abc = "abcdefghijkmnpqrstuvwxyz23456789";
  return Array.from(random(12), (b) => abc[b % abc.length]).join("");
}

/** The order states in which no money has reached a gift yet, or never will. */
const UNPAID = ["preflight", "awaiting_deposit", "failed", "refunded"];

/**
 * Why the sender can't cancel an unpaid gift, or null. Only a gift nothing reached: its last order never got its
 * deposit, 1Click isn't handling one for it, and the account holds nothing.
 */
export function cancelProblem(
  g: { status: GiftStatus; senderUserId: number },
  userId: number,
  p: { lastOrderStatus: string | null; depositSeen: boolean; holds: boolean },
): string | null {
  if (g.senderUserId !== userId) return "Only the sender can cancel a gift.";
  if (g.status === "cancelled") return "It's already cancelled.";
  if (g.status !== "funding") return "Only an unpaid gift can be cancelled. Take it back instead.";
  if (p.lastOrderStatus && !UNPAID.includes(p.lastOrderStatus)) return "Its payment already arrived. Finish the buy or take it back instead.";
  if (p.depositSeen) return "A payment for it is on its way. Wait for it to land, then take the gift back.";
  if (p.holds) return "It already holds money. Take it back instead.";
  return null;
}
