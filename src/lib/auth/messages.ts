// Sign-in messages, shared by client and server so both build the exact same text.
// Renamed with the app (Stonkbag → nearbags): a sign-in signature is checked once against a 5-minute nonce and then
// thrown away (the session is a cookie), so nothing persisted depends on this text. The basket-key unlock message is
// different and must never change: see UNLOCK_MESSAGE_V1 in src/lib/intents/keys.ts.
//
// Security audit 2026-11-18 (item 2): both sign-ins now name the site's host, so a phishing site that relays our nonce
// gets a signature naming nearbags.com (wallets show it, and MetaMask warns when the SIWE domain isn't the page's):
//  - NEAR: the NEP-413 recipient is the host ("nearbags.com", "localhost:3093" locally).
//  - EVM: EIP-4361 (SIWE) with domain = host, uri = origin, nonce = the server nonce in hex.
import { createSiweMessage, parseSiweMessage, validateSiweMessage } from "viem/siwe";
import { isAddressEqual, type Address } from "viem";
import { isAllowedHost, originFor } from "./hosts";

/** The NEP-413 recipient for a sign-in on `host`: the host itself. */
export const nearSignInRecipient = (host: string) => host.toLowerCase();

export function signInMessage(nonceB64: string, origin: string) {
  return [
    "Sign in to nearbags",
    "",
    `Site: ${origin}`,
    `Nonce: ${nonceB64}`,
    "",
    "This signature only proves you own this wallet. It cannot move funds.",
  ].join("\n");
}

export const SIWE_STATEMENT = "Sign in to nearbags. This only proves you own this wallet. It cannot move funds.";
const SIWE_TTL_MS = 5 * 60_000;
const CLOCK_SKEW_MS = 2 * 60_000;

/** SIWE nonces must be alphanumeric, so the 32-byte server nonce goes in as hex. */
export function siweNonce(nonceB64: string): string {
  return Array.from(b64ToBytes(nonceB64), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function buildSiweMessage(p: { address: Address; chainId: number; host: string; nonceB64: string; issuedAt?: Date }): string {
  const issuedAt = p.issuedAt ?? new Date();
  return createSiweMessage({
    address: p.address,
    chainId: p.chainId,
    domain: p.host.toLowerCase(),
    uri: originFor(p.host),
    version: "1",
    nonce: siweNonce(p.nonceB64),
    statement: SIWE_STATEMENT,
    issuedAt,
    expirationTime: new Date(issuedAt.getTime() + SIWE_TTL_MS),
  });
}

/**
 * Check a signed-in SIWE message's text (not the signature) against what this request expects. Throws with a short
 * reason; returns the chain id on success.
 */
export function checkSiweMessage(message: string, want: { host: string; nonceB64: string; address: string; now?: Date }): { chainId: number } {
  const now = want.now ?? new Date();
  const m = parseSiweMessage(message);
  const fail = (why: string): never => {
    throw new Error(`sign-in message ${why}`);
  };
  if (!m.address || !m.domain || !m.uri || !m.nonce || !m.version || m.chainId === undefined || !m.issuedAt || !m.expirationTime) fail("is incomplete");
  // Only the canonical text: re-create it from the parsed fields and require an exact match (no trailing extras).
  let canonical = "";
  try {
    canonical = createSiweMessage({ ...m, address: m.address!, chainId: m.chainId!, domain: m.domain!, nonce: m.nonce!, uri: m.uri!, version: "1" });
  } catch {
    fail("is malformed");
  }
  if (canonical !== message) fail("is malformed");
  if (m.scheme || m.resources || m.requestId !== undefined || m.notBefore) fail("has unexpected fields");
  if (m.version !== "1") fail("has the wrong version");
  if (!isAllowedHost(m.domain) || m.domain !== want.host.toLowerCase()) fail("names the wrong site");
  if (m.uri !== originFor(want.host)) fail("names the wrong site");
  if (m.statement !== SIWE_STATEMENT) fail("has the wrong text");
  if (m.nonce !== siweNonce(want.nonceB64)) fail("has the wrong nonce");
  if (!Number.isSafeInteger(m.chainId) || m.chainId! <= 0) fail("has a bad chain id");
  let sameAddress = false;
  try {
    sameAddress = isAddressEqual(m.address!, want.address as Address);
  } catch {}
  if (!sameAddress) fail("is for a different address");
  if (!validateSiweMessage({ message: m, time: now })) fail("has expired");
  const issued = m.issuedAt!.getTime();
  const expires = m.expirationTime!.getTime();
  if (Number.isNaN(issued) || issued > now.getTime() + CLOCK_SKEW_MS || issued < now.getTime() - SIWE_TTL_MS - CLOCK_SKEW_MS) fail("has a bad issue time");
  if (expires <= issued || expires - issued > SIWE_TTL_MS + CLOCK_SKEW_MS) fail("has a bad expiry");
  return { chainId: m.chainId! };
}

export function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToB64(b: Uint8Array): string {
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s);
}
