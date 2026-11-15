import { describe, expect, it } from "vitest";
import { claimProblem, giftCode, reclaimProblem, sameIntents, shownStatus, transferAll } from "./gift-rules";

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
  });

  it("transfers every non-zero balance to one receiver", () => {
    expect(transferAll("abc", { "nep141:a": "5", "nep141:b": "0", "nep141:c": "7" })).toEqual([
      { intent: "transfer", receiver_id: "abc", tokens: { "nep141:a": "5", "nep141:c": "7" }, memo: "nearbags gift" },
    ]);
    expect(() => transferAll("abc", { "nep141:a": "0" })).toThrow(/empty/);
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
