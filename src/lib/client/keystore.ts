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
 * Ask the wallet to sign the unlock message twice and decide the key mode.
 * `signUnlock` must return the raw signature bytes for UNLOCK_MESSAGE_V1.
 */
export async function setupKeys(wallet: string, signUnlock: () => Promise<Uint8Array>): Promise<KeyMode> {
  const a = await signUnlock();
  const b = await signUnlock();
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

/** The basket key for (wallet, basket). Creates and stores one in device mode. Null if a derived seed is missing. */
export async function basketKey(wallet: string, mode: KeyMode, basketId: number): Promise<BasketKey | null> {
  const ns = walletNs(wallet);
  if (mode === "derived") {
    const box = await get<{ iv: Uint8Array; ct: Uint8Array }>(`seed:${ns}`);
    if (!box) return null;
    return deriveBasketKey(await open(box), basketId);
  }
  const box = await get<{ iv: Uint8Array; ct: Uint8Array }>(`device:${ns}:${basketId}`);
  if (box) return keyFromSecret(await open(box));
  const k = randomBasketKey();
  await put(`device:${ns}:${basketId}`, await seal(k.secretKey));
  return k;
}

/** Device mode only: keys this browser holds for a basket account that the server knows about. */
export async function hasDeviceKey(wallet: string, basketId: number) {
  return Boolean(await get(`device:${walletNs(wallet)}:${basketId}`));
}

export async function forgetWallet(wallet: string) {
  await del(`seed:${walletNs(wallet)}`);
}
