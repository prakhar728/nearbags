// Proof that the caller holds an implicit account's key, before we register that account as their position or gift
// (security audit 2026-11-18, #9). Without it anyone could register a stranger's intents account under a bag, inflating
// its TVL and holders, or squat an account so its owner can't register it.
//
// The proof is an intents payload with no intents, signed by the account's own key. If someone relays it to
// intents.near it does nothing.
import { base58, bytesToHex, parsePublicKey, verifyEd25519, type BasketKey } from "./keys";
import { signIntents, VERIFYING_CONTRACT, type SignedRawEd25519 } from "./payload";

const MAX_AGE_MS = 10 * 60_000;

/** Browser: the proof for this key's account. */
export const ownershipProof = (k: BasketKey): SignedRawEd25519 => signIntents(k, [], { deadlineMs: 5 * 60_000 });

/** Why the proof doesn't show control of `accountId`, or null when it does. */
export function proofProblem(signed: SignedRawEd25519 | undefined, accountId: string, now = Date.now()): string | null {
  if (!signed || signed.standard !== "raw_ed25519" || typeof signed.payload !== "string") return "missing proof that you hold this account's key";
  let pk: ReturnType<typeof parsePublicKey>;
  try {
    pk = parsePublicKey(signed.public_key);
  } catch {
    return "bad public key";
  }
  if (pk.curve !== "ed25519" || bytesToHex(pk.bytes) !== accountId) return "the proof is signed by another key";
  let sig: Uint8Array;
  try {
    sig = base58.decode(String(signed.signature).replace(/^ed25519:/, ""));
  } catch {
    return "bad signature";
  }
  if (!verifyEd25519(pk.bytes, new TextEncoder().encode(signed.payload), sig)) return "the signature doesn't verify";
  let p: { signer_id?: unknown; verifying_contract?: unknown; deadline?: unknown; intents?: unknown };
  try {
    p = JSON.parse(signed.payload);
  } catch {
    return "the proof isn't JSON";
  }
  if (p.verifying_contract !== VERIFYING_CONTRACT || p.signer_id !== accountId) return "the proof is for another account";
  if (!Array.isArray(p.intents) || p.intents.length !== 0) return "the proof must not contain intents";
  const dl = Date.parse(String(p.deadline));
  if (!Number.isFinite(dl) || dl < now || dl > now + MAX_AGE_MS) return "the proof has expired";
  return null;
}
