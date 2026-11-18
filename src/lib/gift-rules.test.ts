import { describe, expect, it } from "vitest";
import { randomBasketKey } from "@/lib/intents/keys";
import {
  addMoved,
  cancelProblem,
  claimProblem,
  fromStatuses,
  giftCode,
  giftPublicKey,
  movedTokens,
  reclaimProblem,
  sameIntents,
  shownStatus,
  toStatus,
  transferAll,
  transferPayloadProblem,
} from "./gift-rules";

const now = new Date("2026-12-01T00:00:00Z");
const later = new Date("2026-12-20T00:00:00Z");
const earlier = new Date("2026-11-20T00:00:00Z");
const ready = { status: "ready" as const, expiresAt: later, senderUserId: 1 };

describe("gift rules", () => {
  it("shows a ready gift past its date as expired", () => {
    expect(shownStatus(ready, now)).toBe("ready");
    expect(shownStatus({ ...ready, expiresAt: earlier }, now)).toBe("expired");
    expect(shownStatus({ ...ready, status: "claimed", expiresAt: earlier }, now)).toBe("claimed");
  });

  it("lets anyone but the sender claim a ready, unexpired gift", () => {
    expect(claimProblem(ready, 2, now)).toBeNull();
    expect(claimProblem(ready, 1, now)).toMatch(/your own gift/);
    expect(claimProblem({ ...ready, status: "funding" }, 2, now)).toMatch(/hasn't been paid/);
    expect(claimProblem({ ...ready, status: "claimed" }, 2, now)).toMatch(/already been claimed/);
    expect(claimProblem({ ...ready, status: "reclaimed" }, 2, now)).toMatch(/took this gift back/);
    expect(claimProblem({ ...ready, expiresAt: earlier }, 2, now)).toMatch(/expired/);
  });

  it("lets only the sender take back an unclaimed gift, expired or not", () => {
    expect(reclaimProblem(ready, 1)).toBeNull();
    expect(reclaimProblem({ ...ready, status: "funding" }, 1)).toBeNull();
    expect(reclaimProblem(ready, 2)).toMatch(/Only the sender/);
    expect(reclaimProblem({ ...ready, status: "claimed" }, 1)).toMatch(/already claimed/);
    // An expired gift is still stored as "ready" (only shown as expired), so the sender can take it back.
    const expired = { ...ready, expiresAt: earlier };
    expect(shownStatus(expired, now)).toBe("expired");
    expect(reclaimProblem(expired, 1)).toBeNull();
  });

  it("lets the sender take back money that landed after a take-back", () => {
    expect(reclaimProblem({ ...ready, status: "reclaimed" }, 1)).toBeNull();
    expect(reclaimProblem({ ...ready, status: "reclaimed" }, 2)).toMatch(/Only the sender/);
  });

  it("only moves a gift from the statuses it was checked in", () => {
    expect(fromStatuses("claim")).toEqual(["ready"]);
    expect(fromStatuses("reclaim")).toEqual(["funding", "ready", "cancelled"]);
    expect(toStatus("claim")).toBe("claimed");
    expect(toStatus("reclaim")).toBe("reclaimed");
  });

  it("transfers every non-zero balance to one receiver", () => {
    expect(transferAll("abc", { "nep141:a": "5", "nep141:b": "0", "nep141:c": "7" })).toEqual([
      { intent: "transfer", receiver_id: "abc", tokens: { "nep141:a": "5", "nep141:c": "7" }, memo: "nearbags gift" },
    ]);
    expect(() => transferAll("abc", { "nep141:a": "0" })).toThrow(/empty/);
  });

  it("names the gift key from its account id, as intents.near does", () => {
    const k = randomBasketKey();
    expect(giftPublicKey(k.accountId)).toBe(k.publicKeyStr);
    expect(() => giftPublicKey("alice.near")).toThrow();
  });

  it("a take-back also removes the gift key, after the transfer", () => {
    const k = randomBasketKey();
    const xs = transferAll("abc", { x: "1" }, giftPublicKey(k.accountId));
    expect(xs).toHaveLength(2);
    expect(xs[1]).toEqual({ intent: "remove_public_key", public_key: k.publicKeyStr });
    expect(sameIntents(xs, transferAll("abc", { x: "1" }))).toBe(false);
    expect(sameIntents(xs, [xs[0], { public_key: k.publicKeyStr, intent: "remove_public_key" }])).toBe(true);
    expect(sameIntents(xs, [xs[0], { intent: "remove_public_key", public_key: randomBasketKey().publicKeyStr }])).toBe(false);
  });

  it("reads what a relayed transfer moved, and adds up a second take-back", () => {
    const xs = [...transferAll("abc", { b: "7", a: "5", c: "0" }), { intent: "remove_public_key" as const, public_key: "ed25519:x" }];
    expect(movedTokens(xs)).toEqual([
      ["a", "5"],
      ["b", "7"],
    ]);
    expect(addMoved(null, [["a", "5"]])).toEqual([["a", "5"]]);
    expect(addMoved([["a", "5"], ["b", "1"]], [["a", "2"], ["c", "3"]])).toEqual([
      ["a", "7"],
      ["b", "1"],
      ["c", "3"],
    ]);
  });

  it("compares intents regardless of token order, but not amounts or receivers", () => {
    const a = transferAll("abc", { x: "1", y: "2" });
    expect(sameIntents(a, [{ intent: "transfer", receiver_id: "abc", tokens: { y: "2", x: "1" }, memo: "nearbags gift" }])).toBe(true);
    expect(sameIntents(a, transferAll("abd", { x: "1", y: "2" }))).toBe(false);
    expect(sameIntents(a, transferAll("abc", { x: "1", y: "3" }))).toBe(false);
    expect(sameIntents(a, [...a, { intent: "add_public_key", public_key: "ed25519:x" }])).toBe(false);
  });

  it("makes 12-character codes from the safe alphabet", () => {
    const c = giftCode((n) => new Uint8Array(n).map((_, i) => i * 37));
    expect(c).toMatch(/^[a-km-z2-9]{12}$/);
  });
});

describe("cancelProblem", () => {
  const g = { status: "funding" as const, senderUserId: 1 };
  const clean = { lastOrderStatus: "awaiting_deposit", depositSeen: false, holds: false };
  it("cancels an unpaid gift nothing reached", () => {
    expect(cancelProblem(g, 1, clean)).toBeNull();
    expect(cancelProblem(g, 1, { ...clean, lastOrderStatus: null })).toBeNull();
    expect(cancelProblem(g, 1, { ...clean, lastOrderStatus: "refunded" })).toBeNull();
  });
  it("refuses once money is on its way or arrived, and for anyone but the sender", () => {
    expect(cancelProblem(g, 2, clean)).toMatch(/Only the sender/);
    expect(cancelProblem({ ...g, status: "ready" }, 1, clean)).toMatch(/Take it back/);
    expect(cancelProblem(g, 1, { ...clean, lastOrderStatus: "funded" })).toMatch(/already arrived/);
    expect(cancelProblem(g, 1, { ...clean, depositSeen: true })).toMatch(/on its way/);
    expect(cancelProblem(g, 1, { ...clean, holds: true })).toMatch(/holds money/);
  });
  it("a cancelled gift can't be claimed, but money that arrives late can still be taken back", () => {
    const c = { status: "cancelled" as const, senderUserId: 1, expiresAt: new Date(Date.now() + 86_400_000) };
    expect(claimProblem(c, 2)).toMatch(/cancelled/);
    expect(reclaimProblem(c, 1)).toBeNull();
  });
});

describe("transferPayloadProblem (the browser's check before signing)", () => {
  const gift = randomBasketKey().accountId;
  const mine = randomBasketKey().accountId;
  const ok = { mode: "reclaim" as const, giftAccount: gift, receiver: mine };
  it("accepts exactly the transfer into your own account, plus removing the gift key on a take-back", () => {
    expect(transferPayloadProblem(transferAll(mine, { x: "1", y: "2" }), ok)).toBeNull();
    expect(transferPayloadProblem(transferAll(mine, { x: "1" }, giftPublicKey(gift)), ok)).toBeNull();
    expect(transferPayloadProblem(transferAll(mine, { x: "1" }), { ...ok, mode: "claim" })).toBeNull();
  });
  it("refuses another receiver, extra intents, odd amounts, or another key", () => {
    const other = randomBasketKey().accountId;
    expect(transferPayloadProblem(transferAll(other, { x: "1" }), ok)).toMatch(/own account/);
    expect(transferPayloadProblem(transferAll(mine, { x: "1" }, giftPublicKey(gift)), { ...ok, mode: "claim" })).toMatch(/only moves/);
    expect(transferPayloadProblem(transferAll(mine, { x: "1" }, giftPublicKey(mine)), ok)).toMatch(/key change/);
    expect(transferPayloadProblem([...transferAll(mine, { x: "1" }), { intent: "add_public_key", public_key: "ed25519:x" }], ok)).toMatch(/key change/);
    expect(transferPayloadProblem([{ intent: "ft_withdraw", token: "x", receiver_id: mine, amount: "1" }], ok)).toMatch(/own account/);
    expect(transferPayloadProblem([{ intent: "transfer", receiver_id: mine, tokens: { x: "-1" }, memo: "nearbags gift" }], ok)).toMatch(/amounts/);
    expect(transferPayloadProblem([{ intent: "transfer", receiver_id: mine, tokens: {}, memo: "nearbags gift" }], ok)).toMatch(/amounts/);
    expect(transferPayloadProblem([...transferAll(mine, { x: "1" }), ...transferAll(mine, { x: "1" })], ok)).toMatch(/key change/);
    expect(transferPayloadProblem([], ok)).toMatch(/Unexpected/);
  });
  it("refuses when the 'gift' is your own account", () => {
    expect(transferPayloadProblem(transferAll(mine, { x: "1" }), { ...ok, giftAccount: mine })).toMatch(/isn't a gift/);
  });
});
