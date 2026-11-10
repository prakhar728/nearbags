// Ask the signer to sign one Rhea leg (built by the app's own leg code), WITHOUT submitting it. One OutLayer run.
// Usage: npx tsx --conditions react-server --env-file=.env.local scripts/agent/signer-smoke-rhea.ts <account> <COIN> <buy|sell> <amount-in-base-units>
import { attestationUrl, runModule, signerModule } from "@/lib/agent/outlayer";
import { getAsset, USDC } from "@/lib/assets";
import { buildPayload } from "@/lib/intents/payload";
import { minOutput, quoteLeg, RHEA_DEADLINE_MS, swapIntent } from "@/lib/rhea";

const [account, coin, side, amount] = process.argv.slice(2);
const meme = getAsset(coin);
const [from, to] = side === "sell" ? [meme.id, "USDC"] : ["USDC", meme.id];
const q = await quoteLeg(from, to, amount);
const spec = { account, token: q.inputToken, amount, poolIds: q.poolIds, outputToken: q.outputToken, minOut: minOutput(BigInt(q.amountOut)).toString() };
const payload = buildPayload(account, [swapIntent(spec)], { deadlineMs: RHEA_DEADLINE_MS });
console.log("quote", { from, to, amountIn: amount, amountOut: q.amountOut, minOut: spec.minOut });
const r = await runModule<{ signed: { payload: string }; usd: number }>(
  signerModule()!,
  { op: "sign_rhea_leg", account_id: account, payload, assets: [USDC.intentsAssetId, meme.intentsAssetId], max_usd: 100 },
  { seconds: 30 },
);
console.log(r.ok ? `signed, $${r.result!.usd}` : `refused: ${r.error}`, "\nproof:", attestationUrl(r.txHash));
process.exit(0);
