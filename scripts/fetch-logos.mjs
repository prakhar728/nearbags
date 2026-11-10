// Download a logo for every asset in src/lib/assets.ts into public/logos/<ID>.png (CoinGecko images).
// Ondo tokenized stocks and ETFs map through 1Click's token list (its coingeckoId); crypto and USDC use known ids.
// Meme coins (Rhea) aren't on CoinGecko's markets list: their logo is the icon in the token's own ft_metadata (NEAR RPC).
// Usage: node scripts/fetch-logos.mjs [ID ...]   (re-run when the asset list changes; IDs limit it to those assets)
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, unlinkSync } from "node:fs";

const only = new Set(process.argv.slice(2));
const wanted = (id) => !only.size || only.has(id);

const UA = { "User-Agent": "nearbags-logo-fetch/1.0", Accept: "application/json" };
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

for (const id of Object.keys(want)) if (!wanted(id)) delete want[id];
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
// Meme coins: { id, token } pairs from assets.ts (venue "rhea").
const memes = [...src.matchAll(/id: "(\w+)",\s*name: "[^"]*",\s*kind: "meme",[\s\S]*?token: "([^"]+)"/g)].map((m) => ({ id: m[1], token: m[2] })).filter((m) => wanted(m.id));
for (const m of memes) {
  const body = { jsonrpc: "2.0", id: 1, method: "query", params: { request_type: "call_function", finality: "final", account_id: m.token, method_name: "ft_metadata", args_base64: "e30=" } };
  const r = await fetch("https://rpc.mainnet.fastnear.com", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((x) => x.json());
  const meta = JSON.parse(new TextDecoder().decode(new Uint8Array(r.result?.result ?? [])) || "{}");
  const icon = /^data:image\/(png|jpeg|webp);base64,(.+)$/.exec(meta.icon ?? "");
  if (!icon) {
    missing.push(`${m.id} (no raster icon in ft_metadata)`);
    continue;
  }
  const buf = Buffer.from(icon[2], "base64");
  if (!isImage(buf) || buf.length > 300_000) {
    missing.push(`${m.id} (not an image)`);
    continue;
  }
  if (icon[1] === "png") writeFileSync(`public/logos/${m.id}.png`, buf);
  else {
    // Logos are served as .png: convert WEBP/JPEG with macOS sips (keeps the file a real PNG).
    const tmp = `public/logos/${m.id}.${icon[1]}`;
    writeFileSync(tmp, buf);
    execFileSync("sips", ["-s", "format", "png", tmp, "--out", `public/logos/${m.id}.png`], { stdio: "ignore" });
    unlinkSync(tmp);
  }
  console.log(`${m.id.padEnd(6)} ${m.token.padEnd(40)} ft_metadata icon (${icon[1]})`);
}
if (missing.length) console.warn("missing:", missing.join(", "));
