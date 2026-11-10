// Smoke test of the agent's two OutLayer jobs through the server's own client, from the relayer account.
// 1. strategist "decide" on sample data;  2. signer "sign_leg" on a real 1Click quote for the agent's own (empty)
// account, then intents.near simulate_intents (expect only "insufficient balance"). No funds move.
// Usage: npx tsx --conditions react-server --env-file=.env.local scripts/agent/smoke.ts
import { attestationUrl, runModule, signerModule, strategistModule } from "@/lib/agent/outlayer";
import { simulateIntents } from "@/lib/intents/rpc";
import type { SignedRawEd25519 } from "@/lib/intents/payload";

const USDC = "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1";
const WNEAR = "nep141:wrap.near";

const strat = strategistModule()!;
const d = await runModule<{ weights: number[]; reason: string; model: string; turnover_bps: number }>(
  strat,
  {
    op: "decide",
    strategy: "Smoke test: lean towards whichever asset rose most this week.",
    assets: [
      { id: "SOL", name: "Solana", price: 160, change_1d: -1.2, change_7d: 6.1, current_bps: 5000 },
      { id: "NEAR", name: "NEAR", price: 3.6, change_1d: 0.4, change_7d: -2.3, current_bps: 5000 },
    ],
    limits: { min_weight_bps: 500, max_weight_bps: 6000, max_change_bps: 1500, max_turnover_bps: 2000 },
  },
  { seconds: 30 },
);
console.log("decide:", JSON.stringify(d.ok ? d.result : d.error), attestationUrl(d.txHash));

const signer = signerModule()!;
const who = await runModule<{ account_id: string }>(signer, { op: "whoami" }, { seconds: 10 });
const acc = who.result!.account_id;
const deadline = new Date(Date.now() + 30 * 60_000).toISOString();
const post = (path: string, body: unknown) =>
  fetch(`https://1click.chaindefuser.com/v0/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
const q = await post("quote", { dry: false, swapType: "EXACT_INPUT", slippageTolerance: 100, originAsset: USDC, depositType: "INTENTS", destinationAsset: WNEAR, amount: "2000000", recipient: acc, recipientType: "INTENTS", refundTo: acc, refundType: "INTENTS", deadline, referral: "stonkbag" });
const da = q.quote.depositAddress as string;
const gen = await post("generate-intent", { type: "swap_transfer", standard: "raw_ed25519", signerId: acc, depositAddress: da });
const s = await runModule<{ signed: SignedRawEd25519; usd: number }>(signer, { op: "sign_leg", account_id: acc, deposit_address: da, payload: gen.intent.payload, assets: [USDC, WNEAR], max_usd: 20 }, { seconds: 30 });
console.log("sign_leg:", s.ok ? `signed ($${s.result!.usd})` : s.error, attestationUrl(s.txHash));
if (s.ok) {
  try {
    await simulateIntents([s.result!.signed]);
    console.log("simulate: accepted (unexpected for an empty account)");
  } catch (e) {
    console.log("simulate:", (e as Error).message.slice(0, 160));
  }
}
process.exit(0);
