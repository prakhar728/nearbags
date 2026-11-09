// Basket keys (spec §4). Runs in the browser and in Node (tests). Pure: no storage, no network.
//
// A basket account is a NEAR implicit account: its id is the hex of an ed25519 public key, and intents.near
// trusts that key for the account with no setup (verified on mainnet 2026-11-09).
import { ed25519 } from "@noble/curves/ed25519.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { base58 } from "@scure/base";

export interface BasketKey {
  secretKey: Uint8Array; // 32-byte ed25519 seed
  publicKey: Uint8Array; // 32 bytes
  publicKeyStr: string; // "ed25519:<base58>"
  accountId: string; // 64-char hex implicit account
}

/** The fixed message whose signature unlocks derived keys. Changing it changes every derived account. */
export const UNLOCK_MESSAGE_V1 = [
  "Stonkbag key unlock",
  "Only sign this on Stonkbag. This signature unlocks your basket keys.",
  "Version: 1",
].join("\n");

/** NEP-413 needs a 32-byte nonce; a fixed one keeps the unlock signature deterministic. */
export const UNLOCK_NONCE_V1 = sha256(new TextEncoder().encode("stonkbag/unlock/v1"));

export function keyFromSecret(secretKey: Uint8Array): BasketKey {
  if (secretKey.length !== 32) throw new Error("ed25519 secret must be 32 bytes");
  const publicKey = ed25519.getPublicKey(secretKey);
  return {
    secretKey,
    publicKey,
    publicKeyStr: `ed25519:${base58.encode(publicKey)}`,
    accountId: bytesToHex(publicKey),
  };
}

export function randomBasketKey(): BasketKey {
  return keyFromSecret(ed25519.utils.randomSecretKey());
}

/** Root seed from the wallet's unlock signature. Never leaves the browser. */
export function seedFromSignature(signature: Uint8Array): Uint8Array {
  if (signature.length < 32) throw new Error("signature too short");
  return sha256(signature);
}

/** Deterministic basket key for (wallet seed, basket). Same inputs → same account, on any device. */
export function deriveBasketKey(seed: Uint8Array, basketId: number | string): BasketKey {
  const okm = hkdf(sha256, seed, new TextEncoder().encode("stonkbag"), new TextEncoder().encode(`basket:${basketId}`), 32);
  return keyFromSecret(okm);
}

export function signBytes(key: BasketKey, message: Uint8Array): Uint8Array {
  return ed25519.sign(message, key.secretKey);
}

export function signatureStr(sig: Uint8Array): string {
  return `ed25519:${base58.encode(sig)}`;
}

export function verifyEd25519(publicKey: Uint8Array, message: Uint8Array, sig: Uint8Array): boolean {
  try {
    return ed25519.verify(sig, message, publicKey);
  } catch {
    return false;
  }
}

export function parsePublicKey(pk: string): { curve: "ed25519" | "secp256k1"; bytes: Uint8Array } {
  const [curve, data] = pk.includes(":") ? pk.split(":") : ["ed25519", pk];
  if (curve !== "ed25519" && curve !== "secp256k1") throw new Error(`unsupported curve ${curve}`);
  const bytes = base58.decode(data);
  if (curve === "ed25519" && bytes.length !== 32) throw new Error("bad ed25519 key length");
  if (curve === "secp256k1" && bytes.length !== 64) throw new Error("bad secp256k1 key length (expect 64-byte uncompressed, no prefix)");
  return { curve, bytes };
}

/** intents.near format for an EVM wallet key: 64-byte uncompressed point without the 0x04 prefix. */
export function secp256k1KeyStr(uncompressedHex: string): string {
  const hex = uncompressedHex.replace(/^0x/, "");
  const bytes = hexToBytes(hex.length === 130 && hex.startsWith("04") ? hex.slice(2) : hex);
  if (bytes.length !== 64) throw new Error("expected 64/65-byte uncompressed secp256k1 key");
  return `secp256k1:${base58.encode(bytes)}`;
}

export const isImplicitAccount = (id: string) => /^[0-9a-f]{64}$/.test(id);

export function bytesToHex(b: Uint8Array): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}
export function hexToBytes(hex: string): Uint8Array {
  const h = hex.replace(/^0x/, "");
  if (h.length % 2) throw new Error("odd hex length");
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(2 * i, 2 * i + 2), 16);
  return out;
}
export { base58 };
