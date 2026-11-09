// Smallest USDC leg that gets a quote, per asset (dry quotes only).
import { ASSETS, USDC } from "../../src/lib/assets";
const JWT = process.env.ONECLICK_JWT!;
const ACCT = "0".repeat(63) + "1";
async function q(asset: string, usd: number) {
  const r = await fetch("https://1click.chaindefuser.com/v0/quote", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${JWT}` },
    body: JSON.stringify({ dry: true, swapType: "EXACT_INPUT", slippageTolerance: 100, originAsset: USDC.intentsAssetId, depositType: "INTENTS",
      destinationAsset: asset, amount: String(Math.round(usd * 1e6)), recipient: ACCT, recipientType: "INTENTS", refundTo: ACCT, refundType: "INTENTS",
      deadline: new Date(Date.now() + 6e5).toISOString() }),
  });
  return r.status === 200 || r.status === 201;
}
async function main() {
  const sizes = (process.env.SIZES ?? "5,10,15,20,25,30,40,50,75,100").split(",").map(Number);
  const ids = process.argv.slice(2);
  for (const a of ASSETS.filter((x) => x.kind !== "stable" && (!ids.length || ids.includes(x.id)))) {
    const row: string[] = [];
    for (const s of sizes) row.push((await q(a.intentsAssetId, s)) ? "✓" : "·");
    console.log(a.id.padEnd(5), sizes.map((s, i) => `${s}${row[i]}`).join(" "));
  }
}
main();
