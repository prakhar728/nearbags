import { describe, expect, it } from "vitest";
import { verifyMessage } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { buildSiweMessage, bytesToB64, checkSiweMessage, nearSignInRecipient, siweNonce } from "./messages";

const acct = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const nonceB64 = bytesToB64(new Uint8Array(32).map((_, i) => i * 7));
const now = new Date("2026-11-18T12:00:00.000Z");
const host = "nearbags.com";
const good = () => buildSiweMessage({ address: acct.address, chainId: 1, host, nonceB64, issuedAt: now });

describe("NEP-413 recipient", () => {
  it("is the host", () => expect(nearSignInRecipient("NearBags.com")).toBe("nearbags.com"));
});

describe("SIWE sign-in message", () => {
  it("builds an EIP-4361 message naming our domain, origin and nonce", () => {
    const m = good();
    expect(m.startsWith("nearbags.com wants you to sign in with your Ethereum account:\n" + acct.address)).toBe(true);
    expect(m).toContain("URI: https://nearbags.com");
    expect(m).toContain(`Nonce: ${siweNonce(nonceB64)}`);
    expect(siweNonce(nonceB64)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("passes the check and the signature recovers the address", async () => {
    const m = good();
    expect(checkSiweMessage(m, { host, nonceB64, address: acct.address, now })).toEqual({ chainId: 1 });
    expect(checkSiweMessage(m, { host, nonceB64, address: acct.address.toLowerCase(), now })).toEqual({ chainId: 1 });
    const signature = await acct.signMessage({ message: m });
    expect(await verifyMessage({ address: acct.address, message: m, signature })).toBe(true);
  });

  it("refuses a message for another site (phishing relay)", () => {
    const m = buildSiweMessage({ address: acct.address, chainId: 1, host: "localhost:3093", nonceB64, issuedAt: now });
    expect(() => checkSiweMessage(m, { host, nonceB64, address: acct.address, now })).toThrow(/wrong site/);
    const evil = good().replace("nearbags.com wants", "evil.io wants");
    expect(() => checkSiweMessage(evil, { host, nonceB64, address: acct.address, now })).toThrow(/wrong site/);
    const evilUri = good().replace("URI: https://nearbags.com", "URI: https://evil.io");
    expect(() => checkSiweMessage(evilUri, { host, nonceB64, address: acct.address, now })).toThrow(/wrong site/);
  });

  it("refuses the wrong nonce, address or statement", () => {
    const other = bytesToB64(new Uint8Array(32).fill(1));
    expect(() => checkSiweMessage(good(), { host, nonceB64: other, address: acct.address, now })).toThrow(/nonce/);
    expect(() => checkSiweMessage(good(), { host, nonceB64, address: "0x000000000000000000000000000000000000dEaD", now })).toThrow(/different address/);
    const stmt = good().replace("It cannot move funds.", "It can move funds.");
    expect(() => checkSiweMessage(stmt, { host, nonceB64, address: acct.address, now })).toThrow(/wrong text/);
  });

  it("refuses stale, future-dated and long-lived messages", () => {
    const later = new Date(now.getTime() + 6 * 60_000);
    expect(() => checkSiweMessage(good(), { host, nonceB64, address: acct.address, now: later })).toThrow(/expired/);
    const future = buildSiweMessage({ address: acct.address, chainId: 1, host, nonceB64, issuedAt: new Date(now.getTime() + 10 * 60_000) });
    expect(() => checkSiweMessage(future, { host, nonceB64, address: acct.address, now })).toThrow(/issue time/);
    const longLived = good().replace(/Expiration Time: .+/, "Expiration Time: 2027-01-01T00:00:00.000Z");
    expect(() => checkSiweMessage(longLived, { host, nonceB64, address: acct.address, now })).toThrow(/expiry/);
  });

  it("refuses non-canonical text and missing fields", () => {
    expect(() => checkSiweMessage(good() + "\nResources:\n- https://evil.io", { host, nonceB64, address: acct.address, now })).toThrow(/unexpected fields/);
    expect(() => checkSiweMessage(good() + "\n\nextra", { host, nonceB64, address: acct.address, now })).toThrow(/malformed/);
    expect(() => checkSiweMessage("Sign in to nearbags\nNonce: x", { host, nonceB64, address: acct.address, now })).toThrow(/incomplete/);
    const noExpiry = good().replace(/\nExpiration Time: .+/, "");
    expect(() => checkSiweMessage(noExpiry, { host, nonceB64, address: acct.address, now })).toThrow(/incomplete/);
  });
});
