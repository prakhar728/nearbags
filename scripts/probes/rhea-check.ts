// Read-only check of the meme-coin (Rhea) path: live prices, HOOT's safety check, two-sided availability, and a dry
// buy preflight for the NEAR Memes seed. View calls and public price APIs only: nothing is signed or sent.
// Usage: pnpm tsx --env-file=.env.local --conditions=react-server scripts/probes/rhea-check.ts [usd]
import { ASSETS } from "../../src/lib/assets";
import { livePrice } from "../../src/lib/prices/live";
import { quoteLeg, tokenSafety } from "../../src/lib/rhea";
import { tradability } from "../../src/lib/trade/availability";
import { preflightBuy } from "../../src/lib/trade/preflight";

async function main() {
  const usd = Number(process.argv[2] ?? 20);
  const memes = ASSETS.filter((a) => a.venue === "rhea");
  for (const a of memes) {
    const [p, s] = await Promise.all([livePrice(a.id), tokenSafety(a.id)]);
    console.log(`${a.id.padEnd(7)} $${p.price.toExponential(4)}  sources ${JSON.stringify(Object.fromEntries(Object.entries(p.sources).map(([k, v]) => [k, Number(v.toExponential(4))])))}  safety ${s.ok ? "ok" : "PAUSED: " + s.reason}`);
    for (const size of [10, 100]) {
      const buy = await quoteLeg("USDC", a.id, String(size * 1e6));
      const units = Number(buy.amountOut) / 10 ** a.decimals;
      const sell = await quoteLeg(a.id, "USDC", buy.amountOut);
      const back = Number(sell.amountOut) / 1e6;
      console.log(`  $${size}: buy ${units.toFixed(0)} ${a.id} (${((1 - (units * p.price) / size) * 100).toFixed(2)}% vs mid), sell back $${back.toFixed(2)} (round trip ${((1 - back / size) * 100).toFixed(2)}%)`);
    }
  }
  console.log("availability", JSON.stringify(await tradability(memes.map((a) => a.id))));
  const r = await preflightBuy({ weights: [{ assetId: "HOOT", weightBps: 5000 }, { assetId: "NEARLY", weightBps: 5000 }], grossUsdc: BigInt(usd * 1e6), creatorFeeBps: 50, platformFeeBps: 25 });
  console.log(`\nNEAR Memes $${usd}: ${r.ok ? "OK" : "BLOCKED " + r.blockedBy.join(" ")}  net $${(Number(r.fees.netUsdc) / 1e6).toFixed(2)} → holds ≈ $${r.estValueUsd.toFixed(2)}`);
  for (const l of r.legs) console.log(`  ${l.assetId.padEnd(7)} ${l.venue ?? ""} $${(Number(l.usdcIn) / 1e6).toFixed(2)} → ${l.amountOutFormatted} (${l.guard ? (l.guard.deviation * 100).toFixed(2) + "% vs pool, " + l.guard.verdict : "—"})`);
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
