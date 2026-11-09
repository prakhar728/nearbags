// Live check against intents.near (read-only simulate, no funds, no gas):
// a derived basket account can add an EVM wallet key (secp256k1) and a NEAR wallet key (ed25519) as recovery keys.
// Usage: pnpm tsx scripts/verify-keys-mainnet.ts
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { hashMessage, recoverPublicKey } from "viem";
import { deriveBasketKey, randomBasketKey, secp256k1KeyStr, seedFromSignature } from "../src/lib/intents/keys";
import { signIntents } from "../src/lib/intents/payload";
import { hasPublicKey, simulateIntents } from "../src/lib/intents/rpc";

async function main() {
  // Stand-in for a wallet's unlock signature.
  const fakeUnlockSig = crypto.getRandomValues(new Uint8Array(64));
  const basket = deriveBasketKey(seedFromSignature(fakeUnlockSig), 42);
  console.log("basket account:", basket.accountId);
  console.log("trusts its own key:", await hasPublicKey(basket.accountId, basket.publicKeyStr));

  const evm = privateKeyToAccount(generatePrivateKey());
  const sig = await evm.signMessage({ message: "x" });
  const evmKey = secp256k1KeyStr(await recoverPublicKey({ hash: hashMessage("x"), signature: sig }));
  const nearWalletKey = randomBasketKey().publicKeyStr;

  for (const [label, key] of [["EVM recovery key", evmKey], ["NEAR recovery key", nearWalletKey]] as const) {
    const signed = signIntents(basket, [{ intent: "add_public_key", public_key: key }]);
    try {
      const out = await simulateIntents([signed]);
      const added = out.logs.some((l) => l.includes("public_key_added"));
      console.log(`${label}: simulate OK, public_key_added event=${added}`);
    } catch (e) {
      console.log(`${label}: FAILED ${(e as Error).message}`);
    }
  }
}
main();
