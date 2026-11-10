// Build and sign intents.near payloads for basket accounts (raw_ed25519 standard).
// Payload shape and nonce rules from near/intents (defuse core): signer_id, verifying_contract, deadline, nonce (base64 32 bytes), intents.
import { signBytes, signatureStr, type BasketKey } from "./keys";

export const VERIFYING_CONTRACT = "intents.near";

export type Intent =
  | { intent: "add_public_key"; public_key: string }
  | { intent: "remove_public_key"; public_key: string }
  | { intent: "transfer"; receiver_id: string; tokens: Record<string, string>; memo?: string }
  // intents.near FtWithdraw (defuse core): burns `amount` of nep141:<token> from the signer and sends the NEP-141 token
  // to receiver_id, with ft_transfer_call when `msg` is set (else ft_transfer). min_gas is a decimal string of gas units.
  // storage_deposit (paid from the signer's wNEAR, not refunded on failure) is deliberately not part of our type.
  | { intent: "ft_withdraw"; token: string; receiver_id: string; amount: string; memo?: string; msg?: string; min_gas?: string };

export interface SignedRawEd25519 {
  standard: "raw_ed25519";
  payload: string;
  public_key: string;
  signature: string;
}

function randomNonceB64(): string {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  // A legacy (non-versioned) nonce must not start with the versioned magic prefix 0x5628f6c6.
  if (b[0] === 0x56 && b[1] === 0x28 && b[2] === 0xf6 && b[3] === 0xc6) b[0] = 0;
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s);
}

export function buildPayload(signerId: string, intents: Intent[], opts: { deadlineMs?: number; nonce?: string } = {}): string {
  return JSON.stringify({
    signer_id: signerId,
    verifying_contract: VERIFYING_CONTRACT,
    deadline: new Date(Date.now() + (opts.deadlineMs ?? 5 * 60_000)).toISOString(),
    nonce: opts.nonce ?? randomNonceB64(),
    intents,
  });
}

/** Sign an exact payload string (as returned by 1Click generate-intent, or built here). */
export function signRaw(key: BasketKey, payload: string): SignedRawEd25519 {
  return {
    standard: "raw_ed25519",
    payload,
    public_key: key.publicKeyStr,
    signature: signatureStr(signBytes(key, new TextEncoder().encode(payload))),
  };
}

export function signIntents(key: BasketKey, intents: Intent[], opts?: { deadlineMs?: number }): SignedRawEd25519 {
  return signRaw(key, buildPayload(key.accountId, intents, opts));
}

/** What a payload claims, for server-side allowlisting before relaying. */
export function parsePayload(p: SignedRawEd25519): { signer_id: string; deadline: string; intents: Intent[] } {
  const j = JSON.parse(p.payload);
  if (j.verifying_contract !== VERIFYING_CONTRACT) throw new Error("wrong verifying_contract");
  if (!Array.isArray(j.intents)) throw new Error("no intents");
  return { signer_id: j.signer_id, deadline: j.deadline, intents: j.intents };
}
