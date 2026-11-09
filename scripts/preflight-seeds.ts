// Live preflight for every seed basket at $100 (dry quotes only; nothing executes).
// Usage: pnpm tsx --env-file=.env.local --conditions=react-server scripts/preflight-seeds.ts
import { SEED_BASKETS } from "../src/lib/seeds";
import { preflightBuy } from "../src/lib/trade/preflight";

async function main() {
  for (const b of SEED_BASKETS) {
    const t0 = Date.now();
    const r = await preflightBuy({ weights: b.weights, grossUsdc: 100_000_000n, creatorFeeBps: 50, platformFeeBps: 25 });
    console.log(`\n${b.name}: ${r.ok ? "OK" : "BLOCKED"}  session=${r.session}  holds ≈ $${r.estValueUsd.toFixed(2)} of $100 (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    for (const l of r.legs) {
      const g = l.guard;
      const dev = g ? `${(g.deviation * 100).toFixed(2)}%`.padStart(7) : "     —";
      const dis = l.priceDisagreement != null ? `  ref-check ${(l.priceDisagreement * 100).toFixed(1)}%` : "";
      console.log(`  ${l.assetId.padEnd(5)} $${(Number(l.usdcIn) / 1e6).toFixed(2).padStart(6)} → ${l.ok ? "ok  " : "FAIL"} vs market ${dev} ${g?.verdict ?? ""}${dis}${l.reason ? "  " + l.reason : ""}`);
    }
    for (const w of r.warnings) console.log("  warn:", w);
  }
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
