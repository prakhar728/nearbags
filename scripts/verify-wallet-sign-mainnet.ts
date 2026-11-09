// Live check against intents.near (read-only simulate_intents, no funds, no gas):
// after a basket account trusts a wallet key, that wallet can authorize a NEW basket key (the new-device flow).
// Covers EVM wallets (ERC-191) and NEAR wallets (NEP-413). Usage: pnpm tsx scripts/verify-wallet-sign-mainnet.ts
import { ed25519 } from "@noble/curves/ed25519.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { hashMessage, recoverPublicKey } from "viem";
import { deriveBasketKey, randomBasketKey, secp256k1KeyStr, seedFromSignature, base58 } from "../src/lib/intents/keys";
import { signIntents } from "../src/lib/intents/payload";
import { simulateIntents } from "../src/lib/intents/rpc";
import { erc191Payload, erc191Signed, nep413Request, nep413Signed } from "../src/lib/intents/wallet-sign";

// NEP-413 hash, as a NEAR wallet computes it: sha256(borsh(tag u32, message, nonce[32], recipient, callbackUrl: None)).
function nep413Hash(message: string, nonce: Uint8Array, recipient: string) {
  const enc = new TextEncoder();
  const str = (s: string) => {
    const b = enc.encode(s);
    const out = new Uint8Array(4 + b.length);
    new DataView(out.buffer).setUint32(0, b.length, true);
    out.set(b, 4);
    return out;
  };
  const tag = new Uint8Array(4);
  new DataView(tag.buffer).setUint32(0, 2 ** 31 + 413, true);
  const parts = [tag, str(message), nonce, str(recipient), new Uint8Array([0])];
  const all = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    all.set(p, o);
    o += p.length;
  }
  return sha256(all);
}

async function main() {
  const basket = deriveBasketKey(seedFromSignature(crypto.getRandomValues(new Uint8Array(64))), 7);
  const newDeviceKey = randomBasketKey().publicKeyStr;

  // EVM wallet
  const evm = privateKeyToAccount(generatePrivateKey());
  const evmKey = secp256k1KeyStr(await recoverPublicKey({ hash: hashMessage("x"), signature: await evm.signMessage({ message: "x" }) }));
  const payload = erc191Payload(basket.accountId, [{ intent: "add_public_key", public_key: newDeviceKey }]);
  const evmSigned = erc191Signed(payload, await evm.signMessage({ message: payload }));
  try {
    const out = await simulateIntents([signIntents(basket, [{ intent: "add_public_key", public_key: evmKey }]), evmSigned]);
    console.log("ERC-191:", out.logs.filter((l) => l.includes("public_key_added")).length === 2 ? "OK (both keys added)" : out.logs);
  } catch (e) {
    console.log("ERC-191 FAILED:", (e as Error).message);
  }

  // NEAR wallet (ed25519)
  const nearSecret = ed25519.utils.randomSecretKey();
  const nearPub = `ed25519:${base58.encode(ed25519.getPublicKey(nearSecret))}`;
  const req = nep413Request(basket.accountId, [{ intent: "add_public_key", public_key: newDeviceKey }]);
  const sig = ed25519.sign(nep413Hash(req.message, req.nonce, req.recipient), nearSecret);
  const nearSigned = nep413Signed(req, nearPub, btoa(String.fromCharCode(...sig)));
  try {
    const out = await simulateIntents([signIntents(basket, [{ intent: "add_public_key", public_key: nearPub }]), nearSigned]);
    console.log("NEP-413:", out.logs.filter((l) => l.includes("public_key_added")).length === 2 ? "OK (both keys added)" : out.logs);
  } catch (e) {
    console.log("NEP-413 FAILED:", (e as Error).message);
  }
}
main();
