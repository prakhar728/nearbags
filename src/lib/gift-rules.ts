// Gift rules (plan feature 2), pure so they're unit-tested. lib/gifts.ts does the database and chain work.
import { base58, hexToBytes } from "@/lib/intents/keys";
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
 * cancelled: the deposit address outlives the cancel, and money that still arrives must be recoverable. So is an
 * expired gift (its stored status is still "ready"), and a gift already taken back: money can land in its account
 * later (a late deposit), and it is the sender's.
 */
export function reclaimProblem(g: { status: GiftStatus; senderUserId: number }, userId: number): string | null {
  if (g.senderUserId !== userId) return "Only the sender can take a gift back.";
  if (g.status === "claimed") return "It was already claimed.";
  return null;
}

/**
 * The statuses a first claim or take-back may start from, so its update can say `WHERE status IN (...)`. A second
 * take-back (status already "reclaimed") is guarded separately, by the first one's tx.
 */
export function fromStatuses(mode: TransferMode): GiftStatus[] {
  return mode === "claim" ? ["ready"] : ["funding", "ready", "cancelled"];
}

/** The status after a claim or take-back. */
export const toStatus = (mode: TransferMode): GiftStatus => (mode === "claim" ? "claimed" : "reclaimed");

/** intents.near's name for a gift account's own key: the account id is the hex of that ed25519 public key. */
export function giftPublicKey(accountId: string): string {
  if (!/^[0-9a-f]{64}$/.test(accountId)) throw new Error("Not an implicit account.");
  return `ed25519:${base58.encode(hexToBytes(accountId))}`;
}

/**
 * The intents a claim or take-back signs: every non-zero balance on the gift account, to one receiver. A take-back
 * also removes the gift's own key (`removeKey`), so the link stops working on intents.near, not only on nearbags.
 * Checked on mainnet with simulate_intents (2026-11-18): the sender's wallet, a recovery key on the gift account, may
 * remove the account's implicit key, and the old key can't sign after that.
 */
export function transferAll(receiver: string, balances: Record<string, string>, removeKey?: string): Intent[] {
  const tokens = Object.fromEntries(Object.entries(balances).filter(([, v]) => BigInt(v) > 0n));
  if (!Object.keys(tokens).length) throw new Error("This gift's account is empty.");
  const out: Intent[] = [{ intent: "transfer", receiver_id: receiver, tokens, memo: "nearbags gift" }];
  if (removeKey) out.push({ intent: "remove_public_key", public_key: removeKey });
  return out;
}

/** The tokens a relayed claim or take-back moved, read from its transfer intents ([asset id, raw units], sorted). */
export function movedTokens(intents: Intent[]): [string, string][] {
  const m = new Map<string, bigint>();
  for (const x of intents) if (x.intent === "transfer") for (const [id, v] of Object.entries(x.tokens)) m.set(id, (m.get(id) ?? 0n) + BigInt(v));
  return [...m].filter(([, v]) => v > 0n).sort(([a], [b]) => a.localeCompare(b)).map(([id, v]) => [id, v.toString()]);
}

/** Two `moved` lists added up: a second take-back of money that landed after the first. */
export function addMoved(a: [string, string][] | null | undefined, b: [string, string][]): [string, string][] {
  const m = new Map<string, bigint>();
  for (const [id, v] of [...(a ?? []), ...b]) m.set(id, (m.get(id) ?? 0n) + BigInt(v));
  return [...m].filter(([, v]) => v > 0n).sort(([x], [y]) => x.localeCompare(y)).map(([id, v]) => [id, v.toString()]);
}

/**
 * The browser's check before it signs a claim or take-back the server handed it: exactly one transfer of positive
 * whole amounts to `receiver` (the user's own position), plus, for a take-back only, removing the gift's own key.
 * Returns why it's refused, or null.
 */
export function transferPayloadProblem(intents: Intent[], p: { mode: TransferMode; giftAccount: string; receiver: string }): string | null {
  if (!/^[0-9a-f]{64}$/.test(p.giftAccount) || p.giftAccount === p.receiver) return "That isn't a gift account.";
  if (!Array.isArray(intents) || intents.length < 1 || intents.length > 2) return "Unexpected gift transfer.";
  const [t, extra] = intents;
  if (t.intent !== "transfer" || t.receiver_id !== p.receiver || t.memo !== "nearbags gift") return "The transfer doesn't go to your own account.";
  const amounts = Object.values(t.tokens ?? {});
  if (!amounts.length || !amounts.every((v) => typeof v === "string" && /^[1-9][0-9]*$/.test(v))) return "Unexpected gift amounts.";
  if (Object.keys(t).some((k) => !["intent", "receiver_id", "tokens", "memo"].includes(k))) return "Unexpected gift transfer.";
  if (extra) {
    if (p.mode !== "reclaim") return "A claim only moves the gift.";
    if (extra.intent !== "remove_public_key" || extra.public_key !== giftPublicKey(p.giftAccount) || Object.keys(extra).length !== 2) return "Unexpected key change.";
  }
  return null;
}

/** Same intents, ignoring key order inside token maps (and refusing extra fields). */
export function sameIntents(a: Intent[], b: Intent[]): boolean {
  const norm = (xs: Intent[]) =>
    JSON.stringify(
      xs.map((x) =>
        x.intent === "transfer"
          ? { i: x.intent, r: x.receiver_id, t: Object.entries(x.tokens).sort(([p], [q]) => p.localeCompare(q)), m: x.memo ?? null, n: Object.keys(x).length }
          : x.intent === "remove_public_key" || x.intent === "add_public_key"
            ? { i: x.intent, k: x.public_key, n: Object.keys(x).length }
            : x,
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
