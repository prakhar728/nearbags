// Verify wallet sign-ins and return the wallet's public key in intents.near format (used as the recovery key).
import "server-only";
import { JsonRpcProvider } from "near-api-js-v7";
import { verifyMessage as verifyNep413 } from "near-api-js-v7/nep413";
import { hashMessage, recoverPublicKey, verifyMessage as verifyEvm, isAddress, getAddress, type Hex } from "viem";
import { rpcUrl } from "@/lib/intents/rpc";
import { secp256k1KeyStr } from "@/lib/intents/keys";
import { b64ToBytes, NEP413_RECIPIENT } from "./messages";

export interface VerifiedWallet {
  chain: "near" | "evm";
  address: string; // NEAR account id, or checksummed EVM address
  publicKey: string; // "ed25519:..." or "secp256k1:..."
}

export async function verifyNearSignIn(p: { accountId: string; publicKey: string; signature: string; nonce: string; message: string }): Promise<VerifiedWallet> {
  const nonce = b64ToBytes(p.nonce);
  if (nonce.length !== 32) throw new Error("bad nonce");
  await verifyNep413({
    signerAccountId: p.accountId,
    signerPublicKey: p.publicKey,
    payload: { message: p.message, recipient: NEP413_RECIPIENT, nonce },
    signature: b64ToBytes(p.signature),
    provider: new JsonRpcProvider({ url: rpcUrl() }),
  });
  return { chain: "near", address: p.accountId, publicKey: p.publicKey.startsWith("ed25519:") ? p.publicKey : `ed25519:${p.publicKey}` };
}

/** EOA wallets only (MetaMask, Rabby, …): smart-contract wallets can't give us a recovery key. */
export async function verifyEvmSignIn(p: { address: string; signature: Hex; message: string }): Promise<VerifiedWallet> {
  if (!isAddress(p.address)) throw new Error("bad address");
  const ok = await verifyEvm({ address: p.address as Hex, message: p.message, signature: p.signature });
  if (!ok) throw new Error("Signature verification failed. Smart-contract wallets aren't supported yet.");
  const pub = await recoverPublicKey({ hash: hashMessage(p.message), signature: p.signature });
  return { chain: "evm", address: getAddress(p.address), publicKey: secp256k1KeyStr(pub) };
}
