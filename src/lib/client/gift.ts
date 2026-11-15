"use client";
// Gift helpers for the browser: the link (key after the #), and moving a gift into your own account for its bag.
import { bytesToHex, hexToBytes, keyFromSecret, type BasketKey } from "@/lib/intents/keys";
import { signIntents, type Intent } from "@/lib/intents/payload";
import type { SignedIntent } from "@/lib/intents/wallet-sign";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) }, cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? `Request failed (${r.status})`);
  return j as T;
}

/** The claim link. The key sits after the #: browsers never send that part to a server. */
export const giftLink = (code: string, k: BasketKey) => `${window.location.origin}/g/${code}#${bytesToHex(k.secretKey)}`;

/** The gift key from this page's link, or null if the link was cut short. */
export function keyFromHash(hash: string, accountId: string): BasketKey | null {
  const hex = hash.replace(/^#/, "").trim();
  if (!/^[0-9a-f]{64}$/.test(hex)) return null;
  const k = keyFromSecret(hexToBytes(hex));
  return k.accountId === accountId ? k : null;
}

export interface OwnAccountDeps {
  keyForBasket: (basketId: number) => Promise<{ k: BasketKey; mode: "derived" | "device" }>;
  walletPubkey: string | null | undefined;
  setStep: (s: string | null) => void;
}

/** Your own account for a bag, set up like a buy does: registered, with your wallet as recovery key. */
export async function ownAccountFor(basketId: number, agentManaged: boolean, d: OwnAccountDeps): Promise<BasketKey> {
  d.setStep("Unlocking your bag key…");
  const { k, mode } = await d.keyForBasket(basketId);
  d.setStep("Setting up your account for this bag…");
  const { position } = await api<{ position: { recoveryKeyAddedAt: string | null; agentKeyAddedAt?: string | null } }>("/api/positions", {
    method: "POST",
    body: JSON.stringify({ basketId, accountId: k.accountId, keyMode: mode }),
  });
  if (!position.recoveryKeyAddedAt) {
    if (!d.walletPubkey) throw new Error("No wallet key on file. Sign out and in again.");
    d.setStep("Adding your wallet as the recovery key…");
    await api("/api/relay/recovery", { method: "POST", body: JSON.stringify({ signed: signIntents(k, [{ intent: "add_public_key", public_key: d.walletPubkey }]) }) });
  }
  if (agentManaged && !position.agentKeyAddedAt) {
    const { key } = await api<{ key: { publicKey: string } | null }>("/api/agent/key");
    if (key) {
      d.setStep("Letting the agent manage this bag…");
      await api("/api/relay/agent", { method: "POST", body: JSON.stringify({ signed: signIntents(k, [{ intent: "add_public_key", public_key: key.publicKey }]) }) });
    }
  }
  return k;
}

/** Claim (or take back) a gift into `receiver`: get the exact transfer, sign it, send it. */
export async function moveGift(code: string, mode: "claim" | "reclaim", receiver: string, sign: (accountId: string, intents: Intent[]) => Promise<SignedIntent>) {
  const { accountId, intents } = await api<{ accountId: string; intents: Intent[] }>(`/api/gifts/${code}/transfer`, { method: "POST", body: JSON.stringify({ mode, receiver }) });
  const signed = await sign(accountId, intents);
  return api<{ txHash: string }>(`/api/gifts/${code}/transfer`, { method: "POST", body: JSON.stringify({ mode, receiver, signed }) });
}

/** Sign with the gift key itself. */
export const signWithKey = (k: BasketKey) => async (accountId: string, intents: Intent[]) => {
  if (k.accountId !== accountId) throw new Error("This link's key doesn't match the gift.");
  return signIntents(k, intents);
};
