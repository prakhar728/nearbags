import { describe, expect, it } from "vitest";
import { isAdminUser, isAdminWallet } from "./admin-match";

const EVM = "0xAbCdEf0123456789abcdef0123456789ABCDEF01";
const raw = ` near:alice.near , evm:${EVM}, bob.near, 0x1111111111111111111111111111111111111111 `;

describe("admin wallets", () => {
  it("matches prefixed entries on their chain only", () => {
    expect(isAdminWallet("near", "alice.near", raw)).toBe(true);
    expect(isAdminWallet("evm", "alice.near", raw)).toBe(false);
    expect(isAdminWallet("evm", EVM.toLowerCase(), raw)).toBe(true);
    expect(isAdminWallet("near", EVM.toLowerCase(), raw)).toBe(false);
  });
  it("plain 0x entries are evm only, other plain entries near only", () => {
    expect(isAdminWallet("evm", "0x1111111111111111111111111111111111111111", raw)).toBe(true);
    expect(isAdminWallet("near", "0x1111111111111111111111111111111111111111", raw)).toBe(false);
    expect(isAdminWallet("near", "bob.near", raw)).toBe(true);
    expect(isAdminWallet("evm", "bob.near", raw)).toBe(false);
  });
  it("compares EVM case-insensitively", () => {
    expect(isAdminWallet("evm", EVM.toUpperCase().replace("0X", "0x"), raw)).toBe(true);
  });
  it("refuses with an empty list and honours the isAdmin flag", () => {
    expect(isAdminWallet("near", "alice.near", "")).toBe(false);
    expect(isAdminUser({ isAdmin: true, walletChain: "near", walletAddress: "x.near" }, "")).toBe(true);
    expect(isAdminUser({ isAdmin: false, walletChain: "near", walletAddress: "eve.near" }, raw)).toBe(false);
  });
});
