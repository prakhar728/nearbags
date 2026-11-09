import { describe, expect, it } from "vitest";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { recoverPublicKey, hashMessage } from "viem";
import {
  base58,
  deriveBasketKey,
  isImplicitAccount,
  keyFromSecret,
  parsePublicKey,
  randomBasketKey,
  secp256k1KeyStr,
  seedFromSignature,
  verifyEd25519,
  bytesToHex,
} from "./keys";
import { buildPayload, parsePayload, signIntents, signRaw } from "./payload";

describe("basket keys", () => {
  const sig = new Uint8Array(64).map((_, i) => i * 7);

  it("derives the same account for the same signature and basket, different for other baskets", () => {
    const seed = seedFromSignature(sig);
    const a1 = deriveBasketKey(seed, 1);
    const a1again = deriveBasketKey(seedFromSignature(sig), "1");
    const a2 = deriveBasketKey(seed, 2);
    expect(a1.accountId).toBe(a1again.accountId);
    expect(a1.accountId).not.toBe(a2.accountId);
    expect(isImplicitAccount(a1.accountId)).toBe(true);
  });

  it("different signatures give unrelated accounts", () => {
    const other = new Uint8Array(64).map((_, i) => i * 7 + 1);
    expect(deriveBasketKey(seedFromSignature(sig), 1).accountId).not.toBe(deriveBasketKey(seedFromSignature(other), 1).accountId);
  });

  it("account id is the hex of the public key and the key string round-trips", () => {
    const k = randomBasketKey();
    expect(k.accountId).toBe(bytesToHex(k.publicKey));
    expect(parsePublicKey(k.publicKeyStr).bytes).toEqual(k.publicKey);
    expect(keyFromSecret(k.secretKey).accountId).toBe(k.accountId);
  });

  it("signed payloads verify against the payload bytes", () => {
    const k = randomBasketKey();
    const s = signIntents(k, [{ intent: "add_public_key", public_key: randomBasketKey().publicKeyStr }]);
    const sigBytes = base58.decode(s.signature.split(":")[1]);
    expect(verifyEd25519(k.publicKey, new TextEncoder().encode(s.payload), sigBytes)).toBe(true);
    const p = parsePayload(s);
    expect(p.signer_id).toBe(k.accountId);
    expect(p.intents[0].intent).toBe("add_public_key");
  });

  it("signRaw signs a payload string exactly as given", () => {
    const k = randomBasketKey();
    const payload = buildPayload(k.accountId, [], { nonce: "AAAA" });
    expect(signRaw(k, payload).payload).toBe(payload);
  });

  it("formats an EVM wallet key the way intents.near expects (64 bytes, no 0x04)", async () => {
    const acct = privateKeyToAccount(generatePrivateKey());
    const msg = "hello";
    const signature = await acct.signMessage({ message: msg });
    const pub = await recoverPublicKey({ hash: hashMessage(msg), signature });
    const str = secp256k1KeyStr(pub);
    expect(str.startsWith("secp256k1:")).toBe(true);
    expect(parsePublicKey(str).bytes.length).toBe(64);
  });
});
