// Real strategist decisions on live market data: two templates and one written strategy. Spends three OutLayer runs.
// Usage: npx tsx --conditions react-server --env-file=.env.local scripts/agent/template-smoke.ts
import { attestationUrl, runModule, strategistModule } from "@/lib/agent/outlayer";
import { marketData } from "@/lib/agent/market";

const ids = ["BTC", "ETH", "SOL", "ZEC", "USDC"];
const base = [3000, 2500, 2000, 1500, 1000];
const market = await marketData(ids);
console.log("input bytes:", JSON.stringify(market).length, "closes:", market.map((m) => `${m.id}:${m.closes.length}`).join(" "));
const limits = { min_weight_bps: 500, max_weight_bps: 6000, max_change_bps: 1500, max_turnover_bps: 2000 };
const assets = market.map((m, i) => ({ ...m, current_bps: base[i] }));
const cases = [
  { label: "trend", input: { op: "decide", assets, limits, template: { id: "trend", base_bps: base, due: true } }, secrets: null },
  { label: "momentum", input: { op: "decide", assets, limits, template: { id: "momentum", base_bps: base, due: true } }, secrets: null },
  {
    label: "ai",
    input: { op: "decide", strategy: "Hold more of whatever has the strongest 90-day trend for its volatility; keep at least 10% USDC.", assets, limits },
    secrets: { profile: process.env.AGENT_SECRETS_PROFILE!, accountId: process.env.AGENT_SECRETS_ACCOUNT! },
  },
];
for (const c of cases) {
  const r = await runModule<{ weights: number[]; reason: string; model: string; build: string }>(strategistModule()!, c.input, { seconds: 60, secrets: c.secrets });
  console.log(c.label, JSON.stringify(r.ok ? { weights: Object.fromEntries(ids.map((id, i) => [id, r.result!.weights[i]])), reason: r.result!.reason, model: r.result!.model, build: r.result!.build } : { error: r.error }));
  console.log("  proof:", attestationUrl(r.txHash));
}
process.exit(0);
