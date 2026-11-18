"use client";
// Gift helpers for the browser: the link (key after the #), and moving a gift into your own account for its bag.
import { transferPayloadProblem } from "@/lib/gift-rules";
import { bytesToHex, hexToBytes, keyFromSecret, type BasketKey } from "@/lib/intents/keys";
import { signIntents, type Intent } from "@/lib/intents/payload";
import { ownershipProof } from "@/lib/intents/proof";
import type { SignedIntent } from "@/lib/intents/wallet-sign";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) }, cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? `Request failed (${r.status})`);
  return j as T;
}

/** The claim link. The key sits after the #: browsers never send that part to a server. */
export const giftLink = (code: string, k: BasketKey) => `${window.location.origin}/g/${code}#${bytesToHex(k.secretKey)}`;

/**
 * The gift key from this page's link, or null if the link was cut short. The page only knows the gift's account when
 * you sent it (`accountId`); for anyone else a key of the wrong gift is caught by the server, which checks the signer.
 */
export function keyFromHash(hash: string, accountId?: string | null): BasketKey | null {
  const hex = hash.replace(/^#/, "").trim();
  if (!/^[0-9a-f]{64}$/.test(hex)) return null;
  const k = keyFromSecret(hexToBytes(hex));
  return !accountId || k.accountId === accountId ? k : null;
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
    body: JSON.stringify({ basketId, accountId: k.accountId, keyMode: mode, proof: ownershipProof(k) }),
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

type Signer = (accountId: string, intents: Intent[]) => Promise<SignedIntent>;

/**
 * Claim (or take back) the gift in `giftAccount` into `receiver`, your own position for the bag: get the exact
 * transfer, check it is only that (see transferPayloadProblem), sign it, send it. A take-back passes both signers: the
 * gift key (if this device has it) signs while it is still on the account; once a take-back removed it, the wallet does.
 */
export async function moveGift(
  code: string,
  mode: "claim" | "reclaim",
  giftAccount: string,
  receiver: string,
  sign: Signer | { gift: Signer | null; wallet: Signer },
) {
  const r = await api<{ accountId?: string; intents: Intent[]; giftKeyLive?: boolean }>(`/api/gifts/${code}/transfer`, {
    method: "POST",
    body: JSON.stringify({ mode, receiver }),
  });
  if (r.accountId && r.accountId !== giftAccount) throw new Error("The server named a different gift account. Nothing was signed.");
  const why = transferPayloadProblem(r.intents, { mode, giftAccount, receiver });
  if (why) throw new Error(`${why} Nothing was signed.`);
  const signer = typeof sign === "function" ? sign : sign.gift && r.giftKeyLive !== false ? sign.gift : sign.wallet;
  const signed = await signer(giftAccount, r.intents);
  return api<{ txHash: string }>(`/api/gifts/${code}/transfer`, { method: "POST", body: JSON.stringify({ mode, receiver, signed }) });
}

/** Sign with the gift key itself. */
export const signWithKey = (k: BasketKey) => async (accountId: string, intents: Intent[]) => {
  if (k.accountId !== accountId) throw new Error("This link's key doesn't match the gift.");
  return signIntents(k, intents);
};
