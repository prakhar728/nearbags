// Download a logo for every asset in src/lib/assets.ts into public/logos/<ID>.png (CoinGecko images).
// Ondo tokenized stocks and ETFs map through 1Click's token list (its coingeckoId); crypto and USDC use known ids.
// Usage: node scripts/fetch-logos.mjs   (re-run when the asset list changes)
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const UA = { "User-Agent": "stonkbag-logo-fetch/1.0", Accept: "application/json" };
const src = readFileSync("src/lib/assets.ts", "utf8");
const ondo = [...src.matchAll(/ondo\("(\w+)", "[^"]*", "\w+", "(0x[0-9a-fA-F]+)"/g)].map((m) => ({ id: m[1], assetId: `nep141:bnb-${m[2].toLowerCase()}.omdep.near` }));
const CRYPTO = { BTC: "bitcoin", ETH: "ethereum", SOL: "solana", NEAR: "near", ZEC: "zcash", XRP: "ripple", DOGE: "dogecoin", SUI: "sui", BNB: "binancecoin", USDC: "usd-coin" };

const tokens = await fetch("https://1click.chaindefuser.com/v0/tokens?ondoTokens=1", { headers: UA }).then((r) => r.json());
const byAsset = new Map(tokens.map((t) => [t.assetId, t.coingeckoId]));
const want = { ...CRYPTO };
for (const a of ondo) {
  const cg = byAsset.get(a.assetId);
  if (cg) want[a.id] = cg;
  else console.warn(`no coingeckoId for ${a.id} (${a.assetId})`);
}

const ids = [...new Set(Object.values(want))];
const markets = await fetch(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&per_page=250&ids=${ids.join(",")}`, { headers: UA }).then((r) => r.json());
const image = new Map(markets.map((m) => [m.id, m.image]));

const isImage = (b) =>
  (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) || // PNG
  (b[0] === 0xff && b[1] === 0xd8) || // JPEG
  (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46); // WEBP (RIFF)

mkdirSync("public/logos", { recursive: true });
const missing = [];
for (const [id, cg] of Object.entries(want)) {
  const url = image.get(cg);
  if (!url) {
    missing.push(`${id} (${cg})`);
    continue;
  }
  const buf = new Uint8Array(await fetch(url.replace("/large/", "/large/"), { headers: { "User-Agent": UA["User-Agent"] } }).then((r) => r.arrayBuffer()));
  if (!isImage(buf) || buf.length > 300_000) {
    missing.push(`${id} (not an image)`);
    continue;
  }
  writeFileSync(`public/logos/${id}.png`, buf);
  console.log(`${id.padEnd(6)} ${cg.padEnd(40)} ${buf.length} bytes`);
}
if (missing.length) console.warn("missing:", missing.join(", "));
