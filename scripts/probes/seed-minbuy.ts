import { minBuyUsd } from "../../src/lib/basket-rules";
import { SEED_BASKETS } from "../../src/lib/seeds";
for (const b of SEED_BASKETS) console.log(b.name.padEnd(22), "$" + minBuyUsd(b.weights, 75));
const alt = [["TSLA", 3000], ["CRCL", 2500], ["SOL", 2500], ["NEAR", 2000]].map(([assetId, weightBps]) => ({ assetId: assetId as string, weightBps: weightBps as number }));
console.log("Degen Mix (no HOOD)".padEnd(22), "$" + minBuyUsd(alt, 75), JSON.stringify(alt.map((w) => `${w.assetId} ${w.weightBps / 100}%`)));
