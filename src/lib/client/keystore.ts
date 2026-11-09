"use client";
// Browser key store (spec §4.2). Keys never leave this browser.
//
// derived mode: the wallet signs UNLOCK_MESSAGE twice; identical signatures → seed = sha256(sig). Basket keys are
//   HKDF(seed, basketId), so any device recovers them with one signature.
// device mode: the wallet's signatures differ (passkey / smart wallets); each basket gets a random key.
//
// Seeds and device keys are stored in IndexedDB encrypted with a non-extractable AES-GCM key that also lives in
// IndexedDB: script on this page can use it, but nobody can export it.
import { deriveBasketKey, keyFromSecret, randomBasketKey, seedFromSignature, type BasketKey } from "@/lib/intents/keys";

const DB_NAME = "stonkbag-keys";
const STORE = "kv";

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function get<T>(key: string): Promise<T | undefined> {
  const d = await idb();
  return new Promise((resolve, reject) => {
    const r = d.transaction(STORE, "readonly").objectStore(STORE).get(key);
    r.onsuccess = () => resolve(r.result as T | undefined);
    r.onerror = () => reject(r.error);
  });
}
async function put(key: string, value: unknown): Promise<void> {
  const d = await idb();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
async function del(key: string): Promise<void> {
  const d = await idb();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function wrapKey(): Promise<CryptoKey> {
  let k = await get<CryptoKey>("wrap");
  if (!k) {
    k = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    await put("wrap", k);
  }
  return k;
}
async function seal(bytes: Uint8Array) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await wrapKey(), bytes as BufferSource));
  return { iv, ct };
}
async function open(box: { iv: Uint8Array; ct: Uint8Array }) {
  return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: box.iv as BufferSource }, await wrapKey(), box.ct as BufferSource));
}

const walletNs = (wallet: string) => wallet.toLowerCase();

export type KeyMode = "derived" | "device";

/**
 * Ask the wallet to sign the unlock message and decide the key mode.
 * `signUnlock` must return the raw signature bytes for UNLOCK_MESSAGE_V1.
 * EVM wallets sign twice: most are deterministic (RFC 6979) but some smart wallets aren't, and those get device mode.
 * NEAR wallets sign once: NEP-413 signatures are ed25519, which is deterministic by construction. (A second popup
 * right after the first, with no click in between, is closed by popup wallets such as Meteor.)
 */
export async function setupKeys(wallet: string, signUnlock: () => Promise<Uint8Array>, opts: { deterministic?: boolean } = {}): Promise<KeyMode> {
  const a = await signUnlock();
  const b = opts.deterministic ? a : await signUnlock();
  const same = a.length === b.length && a.every((x, i) => x === b[i]);
  if (same) {
    await put(`seed:${walletNs(wallet)}`, await seal(seedFromSignature(a)));
    return "derived";
  }
  return "device";
}

/** Re-unlock a derived-mode wallet on a new device or after clearing storage: one signature. */
export async function restoreDerived(wallet: string, signUnlock: () => Promise<Uint8Array>) {
  await put(`seed:${walletNs(wallet)}`, await seal(seedFromSignature(await signUnlock())));
}

export async function hasSeed(wallet: string) {
  return Boolean(await get(`seed:${walletNs(wallet)}`));
}

type Box = { iv: Uint8Array; ct: Uint8Array; accountId?: string; pending?: boolean };
const deviceSlot = (wallet: string, basketId: number) => `device:${walletNs(wallet)}:${basketId}`;
const onAccount = (k: BasketKey, accountId?: string): BasketKey => (accountId ? { ...k, accountId } : k);

/**
 * The basket key for (wallet, basket).
 * - derived mode: recomputed from the seed (null if the seed isn't unlocked on this device).
 * - device mode: the key this browser holds. With no key and no existing account, a new one is created.
 *   With no key but an existing account (`accountId`), returns null: the wallet must authorize a new key first.
 */
export async function basketKey(wallet: string, mode: KeyMode, basketId: number, accountId?: string): Promise<BasketKey | null> {
  if (mode === "derived") {
    const box = await get<Box>(`seed:${walletNs(wallet)}`);
    if (!box) return null;
    return deriveBasketKey(await open(box), basketId);
  }
  const box = await get<Box>(deviceSlot(wallet, basketId));
  if (box && !box.pending) {
    const k = keyFromSecret(await open(box));
    if (accountId && (box.accountId ?? k.accountId) !== accountId) return null; // a key for some other account
    return onAccount(k, box.accountId);
  }
  if (accountId) return null;
  const k = randomBasketKey();
  await put(deviceSlot(wallet, basketId), await seal(k.secretKey));
  return k;
}

/**
 * New device: a fresh key for an existing basket account, kept as pending until the wallet's approval lands
 * on-chain. Calling again before confirming reuses the same pending key, so a retry never orphans one.
 */
export async function pendingDeviceKey(wallet: string, basketId: number, accountId: string): Promise<BasketKey> {
  const box = await get<Box>(deviceSlot(wallet, basketId));
  if (box?.pending && box.accountId === accountId) return onAccount(keyFromSecret(await open(box)), accountId);
  const k = randomBasketKey();
  await put(deviceSlot(wallet, basketId), { ...(await seal(k.secretKey)), accountId, pending: true });
  return onAccount(k, accountId);
}

export async function confirmDeviceKey(wallet: string, basketId: number) {
  const box = await get<Box>(deviceSlot(wallet, basketId));
  if (box?.pending) await put(deviceSlot(wallet, basketId), { ...box, pending: false });
}

export async function forgetWallet(wallet: string) {
  await del(`seed:${walletNs(wallet)}`);
}
