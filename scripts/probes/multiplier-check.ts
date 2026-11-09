// Compare our dividend-derived shares-per-token with the ratio implied by 1Click's token prices.
import { and, eq, gte } from "drizzle-orm";
import { db, schema } from "../../src/db";
import { ASSETS } from "../../src/lib/assets";
import { consensusDividends } from "../../src/lib/prices/total-return";

const LAUNCH = "2025-09-03"; // Ondo Global Markets launch
async function main() {
  const toks: { assetId: string; price: number }[] = await fetch("https://1click.chaindefuser.com/v0/tokens?ondoTokens=1").then((r) => r.json());
  const price = new Map(toks.map((t) => [t.assetId, t.price]));
  for (const a of ASSETS.filter((x) => x.kind === "stock" || x.kind === "etf")) {
    const divRows = await db().select().from(schema.dividends).where(and(eq(schema.dividends.ticker, a.refTicker), gte(schema.dividends.exDate, LAUNCH)));
    const bySrc = new Map<string, { date: string; amount: number }[]>();
    for (const r of divRows) (bySrc.get(r.source) ?? bySrc.set(r.source, []).get(r.source)!).push({ date: r.exDate, amount: r.amount });
    const divs = consensusDividends([...bySrc.values()]);
    const closes = await db().select().from(schema.priceMedian).where(and(eq(schema.priceMedian.ticker, a.refTicker), gte(schema.priceMedian.date, "2025-08-01")));
    const sorted = closes.sort((x, y) => x.date.localeCompare(y.date));
    let m = 1;
    for (const d of divs) {
      const prev = [...sorted].reverse().find((c) => c.date < d.date);
      if (prev) m *= 1 + (0.7 * d.amount) / prev.close;
    }
    const last = sorted.at(-1)!.close;
    const p = price.get(a.intentsAssetId);
    const implied = p ? p / last : NaN;
    console.log(`${a.id.padEnd(5)} divs=${String(divs.length).padStart(2)}  ours=${m.toFixed(4)}  1click=${implied.toFixed(4)}  diff=${((implied / m - 1) * 100).toFixed(2)}%  (token $${p?.toFixed(2)} vs close $${last.toFixed(2)})`);
  }
  process.exit(0);
}
main();
