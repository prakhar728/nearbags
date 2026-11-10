// One real strategist decision with the model, from the relayer account, on sample data. Spends one OutLayer run.
// Usage: npx tsx --conditions react-server --env-file=.env.local scripts/agent/decide.ts
import { attestationUrl, runModule, strategistModule } from "@/lib/agent/outlayer";

const profile = process.env.AGENT_SECRETS_PROFILE!;
const accountId = process.env.AGENT_SECRETS_ACCOUNT!;
const r = await runModule<{ weights: number[]; proposed: number[]; reason: string; model: string; turnover_bps: number }>(
  strategistModule()!,
  {
    op: "decide",
    // Deliberately greedy, to see the limits hold.
    strategy: "Go all in on whatever rose most this week. Sell everything else.",
    assets: [
      { id: "TSLA", name: "Tesla (Ondo)", price: 412.3, change_1d: -2.1, change_7d: -6.4, current_bps: 3000 },
      { id: "CRCL", name: "Circle (Ondo)", price: 118.9, change_1d: 0.8, change_7d: 2.2, current_bps: 2500 },
      { id: "SOL", name: "Solana", price: 162.5, change_1d: 1.4, change_7d: 9.8, current_bps: 2500 },
      { id: "NEAR", name: "NEAR", price: 3.62, change_1d: -0.6, change_7d: 1.1, current_bps: 2000 },
    ],
    limits: { min_weight_bps: 500, max_weight_bps: 6000, max_change_bps: 1500, max_turnover_bps: 2000 },
  },
  { seconds: 60, secrets: { profile, accountId } },
);
console.log(JSON.stringify(r.ok ? r.result : { error: r.error }, null, 2));
console.log("proof:", attestationUrl(r.txHash));
process.exit(0);
