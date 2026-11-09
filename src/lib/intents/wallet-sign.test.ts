import { describe, expect, it } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { base58, randomBasketKey, secp256k1KeyStr } from "./keys";
import { erc191Payload, erc191Signed, nep413Request, nep413Signed, parseWalletSigned, walletSignerKey } from "./wallet-sign";

const account = "a".repeat(64);
const newKey = randomBasketKey().publicKeyStr;

describe("wallet-signed intents", () => {
  it("ERC-191: normalizes v to 0/1 and recovers the signing wallet's key", async () => {
    const evm = privateKeyToAccount(generatePrivateKey());
    const payload = erc191Payload(account, [{ intent: "add_public_key", public_key: newKey }]);
    const signed = erc191Signed(payload, await evm.signMessage({ message: payload }));
    const raw = base58.decode(signed.signature.replace("secp256k1:", ""));
    expect(raw.length).toBe(65);
    expect(raw[64]).toBeLessThan(2);
    expect(await walletSignerKey(signed)).toBe(secp256k1KeyStr(evm.publicKey));
    expect(parseWalletSigned(signed)).toMatchObject({ signer_id: account, intents: [{ intent: "add_public_key", public_key: newKey }] });
  });

  it("ERC-191: a different wallet recovers a different key", async () => {
    const a = privateKeyToAccount(generatePrivateKey());
    const b = privateKeyToAccount(generatePrivateKey());
    const payload = erc191Payload(account, [{ intent: "add_public_key", public_key: newKey }]);
    const signed = erc191Signed(payload, await a.signMessage({ message: payload }));
    expect(await walletSignerKey(signed)).not.toBe(secp256k1KeyStr(b.publicKey));
  });

  it("NEP-413: builds the intents.near shape", async () => {
    const req = nep413Request(account, [{ intent: "add_public_key", public_key: newKey }]);
    expect(req.recipient).toBe("intents.near");
    expect(req.nonce.length).toBe(32);
    const sig = btoa(String.fromCharCode(...new Uint8Array(64).fill(7)));
    const signed = nep413Signed(req, "ed25519:abc", sig);
    expect(signed.signature.startsWith("ed25519:")).toBe(true);
    expect(base58.decode(signed.signature.slice(8)).length).toBe(64);
    expect(await walletSignerKey(signed)).toBe("ed25519:abc");
    expect(parseWalletSigned(signed).signer_id).toBe(account);
  });

  it("rejects payloads for another contract", () => {
    const signed = { standard: "nep413" as const, payload: { message: "{}", nonce: "", recipient: "evil.near" }, public_key: "ed25519:x", signature: "ed25519:y" };
    expect(() => parseWalletSigned(signed)).toThrow();
  });
});
