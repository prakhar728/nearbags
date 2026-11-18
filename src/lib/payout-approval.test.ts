import { describe, expect, it } from "vitest";
import { needsApproval, payoutApprovalProblem, payoutApprovalText } from "./payout-approval";

describe("payout approvals", () => {
  const at = new Date("2026-11-18T10:00:00Z");
  const now = at.getTime() + 60_000;
  const want = { host: "nearbags.com", positionId: 7, addresses: ["0xAbc", "bob.near"], now };

  it("accepts the exact text for this bag, site and addresses (in any order)", () => {
    const m = payoutApprovalText({ host: "nearbags.com", positionId: 7, addresses: ["bob.near", "0xAbc"], issuedAt: at });
    expect(payoutApprovalProblem(m, want)).toBeNull();
  });

  it("refuses another bag, site or address, an old approval, or something else", () => {
    const m = (o: Partial<{ host: string; positionId: number; addresses: string[] }>) => payoutApprovalText({ host: "nearbags.com", positionId: 7, addresses: ["0xAbc", "bob.near"], issuedAt: at, ...o });
    expect(payoutApprovalProblem(m({ positionId: 8 }), want)).toMatch(/different/);
    expect(payoutApprovalProblem(m({ host: "evil.com" }), want)).toMatch(/different/);
    expect(payoutApprovalProblem(m({ addresses: ["0xAbc", "eve.near"] }), want)).toMatch(/different/);
    expect(payoutApprovalProblem(m({}), { ...want, now: at.getTime() + 11 * 60_000 })).toMatch(/expired/);
    expect(payoutApprovalProblem("hello", want)).toMatch(/not a payout/);
  });

  it("only addresses other than the signed-in wallet need approval", () => {
    expect(needsApproval(["0xABCdef", " 0x111 "], { chain: "evm", address: "0xabcDEF" })).toEqual(["0x111"]);
    expect(needsApproval(["alice.near", "bob.near"], { chain: "near", address: "alice.near" })).toEqual(["bob.near"]);
  });
});
