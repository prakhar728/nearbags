// Smoke test: fetch a few days from every source and compare with each other.
// Usage: pnpm tsx scripts/check-sources.ts [ASSET ...]
import { getAsset } from "../src/lib/assets";
import { fetchSource, sourcesFor } from "../src/lib/prices/sources";

const ids = process.argv.slice(2).length ? process.argv.slice(2) : ["TSLA", "SGOV", "BTC", "NEAR", "BNB"];
const from = process.env.FROM ?? new Date(Date.now() - 10 * 86_400_000).toISOString().slice(0, 10);

for (const id of ids) {
  const asset = getAsset(id);
  console.log(`\n${id} (${asset.kind}) from ${from}`);
  for (const s of sourcesFor(asset)) {
    try {
      const bars = await fetchSource(s, asset, from);
      const tail = bars.slice(-3).map((b) => `${b.date}=${b.close}`).join("  ");
      console.log(`  ${s.padEnd(11)} ${String(bars.length).padStart(4)} bars  ${tail}`);
    } catch (e) {
      console.log(`  ${s.padEnd(11)} ERROR ${(e as Error).message}`);
    }
  }
}
