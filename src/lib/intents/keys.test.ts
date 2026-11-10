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
  UNLOCK_MESSAGE_V1,
  UNLOCK_NONCE_V1,
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

// The app was renamed from Stonkbag to nearbags. These values derive every existing user's basket accounts, so
// they must never follow the rename: a change here would point users at empty accounts and strand their funds.
describe("frozen unlock constants (pre-rename values)", () => {
  it("keeps the unlock message byte for byte", () => {
    expect(UNLOCK_MESSAGE_V1).toBe(
      "Stonkbag key unlock\nOnly sign this on Stonkbag. This signature unlocks your basket keys.\nVersion: 1",
    );
  });

  it("keeps the unlock nonce = sha256(\"stonkbag/unlock/v1\")", () => {
    expect(bytesToHex(UNLOCK_NONCE_V1)).toBe("3c0fbd16bebf239a7e5830e51cdec7c25b3ef1908deafd2d695c9e2df3ce9c07");
  });

  it("keeps the HKDF salt \"stonkbag\" and the basket:<id> info (derived accounts unchanged)", () => {
    const seed = seedFromSignature(new Uint8Array(64).map((_, i) => i * 7));
    expect(deriveBasketKey(seed, 1).accountId).toBe("fbb9fb6ff32e1b8b77ce47c0fb09bc4fdff0b0f657970f4249e0dcb231db7d27");
    expect(deriveBasketKey(seed, 42).accountId).toBe("1edc7d250db59dedc7a350d9b2d8e4e1def9ef9cb5bee290b038ffc28935ea40");
  });
});
