// Intents signed by the user's WALLET (the recovery key) rather than a basket key.
// Used when a browser has lost its basket key (new device, cleared storage): the wallet authorizes a fresh key.
//
// ERC-191 (EVM wallets): personal_sign over the same JSON payload as raw_ed25519; signature "secp256k1:" + base58(r‖s‖v), v ∈ {0,1}.
// NEP-413 (NEAR wallets): signMessage({ message, nonce, recipient: "intents.near" }) where message is
//   JSON { signer_id, deadline, intents } and the NEP-413 nonce doubles as the intent nonce.
// Both shapes were checked against intents.near with simulate_intents (scripts/verify-wallet-sign-mainnet.ts).
import { hashMessage, recoverPublicKey, type Hex } from "viem";
import { base58, bytesToHex, secp256k1KeyStr } from "./keys";
import { buildPayload, VERIFYING_CONTRACT, type Intent, type SignedRawEd25519 } from "./payload";

export interface SignedErc191 {
  standard: "erc191";
  payload: string;
  signature: string;
}
export interface SignedNep413 {
  standard: "nep413";
  payload: { message: string; nonce: string; recipient: string };
  public_key: string;
  signature: string;
}
export type SignedIntent = SignedRawEd25519 | SignedErc191 | SignedNep413;

function randomNonce(): Uint8Array {
  const b = crypto.getRandomValues(new Uint8Array(32));
  if (b[0] === 0x56 && b[1] === 0x28 && b[2] === 0xf6 && b[3] === 0xc6) b[0] = 0; // legacy nonces must not look versioned
  return b;
}
const toB64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const fromHex = (h: string) => Uint8Array.from((h.startsWith("0x") ? h.slice(2) : h).match(/../g)!.map((x) => parseInt(x, 16)));

/** EVM: the exact string the wallet signs with personal_sign. */
export function erc191Payload(signerId: string, intents: Intent[], deadlineMs = 10 * 60_000): string {
  return buildPayload(signerId, intents, { deadlineMs });
}

export function erc191Signed(payload: string, signatureHex: string): SignedErc191 {
  const sig = fromHex(signatureHex);
  if (sig.length !== 65) throw new Error("Expected a 65-byte signature.");
  if (sig[64] >= 27) sig[64] -= 27;
  return { standard: "erc191", payload, signature: `secp256k1:${base58.encode(sig)}` };
}

/** NEAR: what to pass to the wallet's signMessage. */
export function nep413Request(signerId: string, intents: Intent[], deadlineMs = 10 * 60_000) {
  const message = JSON.stringify({ signer_id: signerId, deadline: new Date(Date.now() + deadlineMs).toISOString(), intents });
  return { message, nonce: randomNonce(), recipient: VERIFYING_CONTRACT };
}

/** `signature` is what wallet selectors return: base64 of the 64-byte ed25519 signature. */
export function nep413Signed(req: { message: string; nonce: Uint8Array; recipient: string }, publicKey: string, signatureB64: string): SignedNep413 {
  return {
    standard: "nep413",
    payload: { message: req.message, nonce: toB64(req.nonce), recipient: req.recipient },
    public_key: publicKey.startsWith("ed25519:") ? publicKey : `ed25519:${publicKey}`,
    signature: `ed25519:${base58.encode(fromB64(signatureB64))}`,
  };
}

/** What a wallet-signed payload claims, for allowlisting on the server. */
export function parseWalletSigned(s: SignedErc191 | SignedNep413): { signer_id: string; intents: Intent[]; signerKey?: string } {
  if (s.standard === "erc191") {
    const j = JSON.parse(s.payload);
    if (j.verifying_contract !== VERIFYING_CONTRACT) throw new Error("wrong verifying_contract");
    return { signer_id: j.signer_id, intents: j.intents };
  }
  if (s.payload.recipient !== VERIFYING_CONTRACT) throw new Error("wrong recipient");
  const j = JSON.parse(s.payload.message);
  return { signer_id: j.signer_id, intents: j.intents, signerKey: s.public_key };
}

/** The wallet key that produced a signed payload, in intents.near format ("secp256k1:…" or "ed25519:…"). */
export async function walletSignerKey(s: SignedErc191 | SignedNep413): Promise<string> {
  if (s.standard === "nep413") return s.public_key;
  const raw = base58.decode(s.signature.replace(/^secp256k1:/, ""));
  if (raw.length !== 65) throw new Error("Malformed signature.");
  const hex = `0x${bytesToHex(raw.slice(0, 64))}${(raw[64] + 27).toString(16)}` as Hex;
  return secp256k1KeyStr(await recoverPublicKey({ hash: hashMessage(s.payload), signature: hex }));
}
