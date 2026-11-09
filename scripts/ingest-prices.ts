// Usage: pnpm prices:ingest [--full] [ASSET ...]
import { ingestAll } from "../src/lib/prices/store";

async function main() {
  const args = process.argv.slice(2);
  const full = args.includes("--full");
  const ids = args.filter((a) => !a.startsWith("--"));
  const results = await ingestAll({ full, ids: ids.length ? ids : undefined });
  for (const r of results) {
    const src = Object.entries(r.sources)
      .map(([s, v]) => `${s}=${typeof v === "number" || s === "dividends" ? v : "ERR(" + v + ")"}`)
      .join(" ");
    console.log(`${r.ticker.padEnd(6)} from ${r.from}  days=${r.medianDays}  flagged=${r.flaggedDays}  ${src}`);
  }
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
