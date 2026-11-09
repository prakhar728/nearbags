// Funding quotes into a basket account (dry): same-asset USDC, and a few common pay tokens.
const JWT = process.env.ONECLICK_JWT!;
const ACCT = "0".repeat(63) + "1";
const USDC = "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1";
async function q(origin: string, amount: string, refundTo: string) {
  const r = await fetch("https://1click.chaindefuser.com/v0/quote", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${JWT}` },
    body: JSON.stringify({ dry: true, swapType: "EXACT_INPUT", slippageTolerance: 100, originAsset: origin, depositType: "ORIGIN_CHAIN", destinationAsset: USDC,
      amount, recipient: ACCT, recipientType: "INTENTS", refundTo, refundType: "ORIGIN_CHAIN", deadline: new Date(Date.now() + 6e5).toISOString() }),
  });
  const j = await r.json();
  return r.ok ? `$${Number(j.quote.amountOutUsd).toFixed(2)} in ~${j.quote.timeEstimate}s` : `HTTP ${r.status} ${j.message}`;
}
async function main() {
  const toks: { assetId: string; symbol: string; blockchain: string; decimals: number; price: number }[] = await fetch("https://1click.chaindefuser.com/v0/tokens").then((r) => r.json());
  const pick = (sym: string, chain: string) => toks.find((t) => t.symbol === sym && t.blockchain === chain)!;
  const EVM = "0x742d35Cc6634C0532925a3b844Bc454e4438f44e";
  const cases: [string, string, string][] = [
    ["USDC", "near", "probe.near"], ["USDC", "arb", EVM], ["USDC", "base", EVM], ["ETH", "arb", EVM], ["ETH", "eth", EVM],
    ["USDT", "eth", EVM], ["wNEAR", "near", "probe.near"], ["SOL", "sol", "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"], ["BTC", "btc", "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq"],
  ];
  for (const [sym, chain, refund] of cases) {
    const t = pick(sym, chain);
    if (!t) { console.log(sym, chain, "not listed"); continue; }
    const amt = BigInt(Math.floor((100 / t.price) * 10 ** Math.min(t.decimals, 12))) * 10n ** BigInt(Math.max(0, t.decimals - 12));
    console.log(`${sym.padEnd(5)} ${chain.padEnd(5)} $100 → ${await q(t.assetId, amt.toString(), refund)}`);
  }
}
main();

export {};
