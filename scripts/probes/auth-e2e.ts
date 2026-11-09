// End-to-end sign-in test against the local dev server with a throwaway EVM key.
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
const BASE = process.env.BASE ?? "http://localhost:3077";
async function main() {
  const acct = privateKeyToAccount(generatePrivateKey());
  const { nonce, message } = await fetch(`${BASE}/api/auth/nonce`, { method: "POST" }).then((r) => r.json());
  const signature = await acct.signMessage({ message });
  const verify = (body: object) => fetch(`${BASE}/api/auth/verify`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  const ok = await verify({ chain: "evm", nonce, address: acct.address, signature });
  const cookie = ok.headers.get("set-cookie")?.split(";")[0];
  console.log("1. valid sign-in:", ok.status, JSON.stringify(await ok.json()));
  const me = await fetch(`${BASE}/api/auth/me`, { headers: { cookie: cookie ?? "" } }).then((r) => r.json());
  console.log("2. /me with cookie:", me.user?.address === acct.address ? "matches" : "MISMATCH", "| recovery key:", me.user?.walletPubkey?.slice(0, 22) + "…");
  const replay = await verify({ chain: "evm", nonce, address: acct.address, signature });
  console.log("3. replayed nonce:", replay.status, (await replay.json()).error);
  const n2 = await fetch(`${BASE}/api/auth/nonce`, { method: "POST" }).then((r) => r.json());
  const other = privateKeyToAccount(generatePrivateKey());
  const forged = await verify({ chain: "evm", nonce: n2.nonce, address: acct.address, signature: await other.signMessage({ message: n2.message }) });
  console.log("4. someone else's signature:", forged.status, (await forged.json()).error);
  const n3 = await fetch(`${BASE}/api/auth/nonce`, { method: "POST" }).then((r) => r.json());
  const near = await verify({ chain: "near", nonce: n3.nonce, accountId: "nobody-here-xyz.near", publicKey: "ed25519:11111111111111111111111111111111", signature: "AAAA" });
  console.log("5. fake NEAR account:", near.status, (await near.json()).error);
  const noCookie = await fetch(`${BASE}/api/auth/me`).then((r) => r.json());
  console.log("6. /me without cookie:", JSON.stringify(noCookie));
}
main();
