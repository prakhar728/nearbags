// Print analytics for the seed baskets from real stored prices. Usage: pnpm tsx --env-file=.env.local scripts/backtest-seeds.ts
import { analyzeBasket } from "../src/lib/analytics/basket";
import { SEED_BASKETS } from "../src/lib/seeds";

const pct = (x: number | null | undefined) => (x == null ? "  n/a" : `${(x * 100).toFixed(1)}%`.padStart(6));

async function main() {
  for (const b of SEED_BASKETS) {
    for (const mode of ["hold", "monthly"] as const) {
      const r = await analyzeBasket(b.weights, { mode });
      if ("error" in r) {
        console.log(b.name, "ERROR", r.error);
        continue;
      }
      if (mode === "hold") {
        console.log(`\n${b.name}  ${r.start} → ${r.end}${r.limitedBy ? `  (history limited by ${r.limitedBy.assetId})` : ""}`);
        const spy = r.benchmarks.SPY?.at(-1);
        const btc = r.benchmarks.BTC?.at(-1);
        console.log(`  $1,000 → $${r.value.at(-1)!.toFixed(0)}   SPY $${spy?.toFixed(0) ?? "n/a"}   BTC $${btc?.toFixed(0) ?? "n/a"}`);
        console.log(
          `  CAGR 1y${pct(r.windows["1y"]?.cagr)} 3y${pct(r.windows["3y"]?.cagr)} 5y${pct(r.windows["5y"]?.cagr)}  worst drop${pct(r.stats.maxDrawdown)}  vol${pct(r.stats.volatility)}  sharpe ${r.stats.sharpe?.toFixed(2) ?? "n/a"}  diversification${pct(r.diversification)}`,
        );
        console.log(`  contributions: ${Object.entries(r.contributions).map(([k, v]) => `${k} ${pct(v).trim()}`).join(", ")}`);
        console.log(`  together: ${r.pairs.together.map((p) => `${p.a}+${p.b} ${p.rho.toFixed(2)}`).join(", ") || "none"}`);
        console.log(`  offset:   ${r.pairs.offset.map((p) => `${p.a}/${p.b} ${p.rho.toFixed(2)}`).join(", ") || "none"}`);
      } else {
        console.log(`  monthly-rebalanced: $1,000 → $${r.value.at(-1)!.toFixed(0)}`);
      }
    }
  }
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
