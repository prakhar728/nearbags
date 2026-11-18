import { describe, expect, it } from "vitest";
import { randomBasketKey } from "./keys";
import { signIntents, signRaw } from "./payload";
import { ownershipProof, proofProblem } from "./proof";

describe("proofProblem", () => {
  const k = randomBasketKey();

  it("accepts a fresh empty payload signed by the account's own key", () => {
    expect(proofProblem(ownershipProof(k), k.accountId)).toBeNull();
  });

  it("refuses a missing proof, another account, or another key", () => {
    const other = randomBasketKey();
    expect(proofProblem(undefined, k.accountId)).toMatch(/missing/);
    expect(proofProblem(ownershipProof(other), k.accountId)).toMatch(/another key/);
  });

  it("refuses a payload that carries intents", () => {
    const p = signIntents(k, [{ intent: "add_public_key", public_key: "ed25519:11111111111111111111111111111111" }]);
    expect(proofProblem(p, k.accountId)).toMatch(/must not contain intents/);
  });

  it("refuses an expired proof and a tampered one", () => {
    const p = ownershipProof(k);
    expect(proofProblem(p, k.accountId, Date.now() + 6 * 60_000)).toMatch(/expired/);
    const tampered = { ...p, payload: p.payload.replace(k.accountId, "0".repeat(64)) };
    expect(proofProblem(tampered, k.accountId)).toMatch(/signature/);
    const wrongSigner = signRaw(k, JSON.stringify({ ...JSON.parse(p.payload), signer_id: "0".repeat(64) }));
    expect(proofProblem(wrongSigner, k.accountId)).toMatch(/another account/);
  });
});
