// Can 1Click move a token out of Intents to its native chain unchanged (TSLAon → BNB Chain, nBTC → Bitcoin)?
const JWT = process.env.ONECLICK_JWT!;
const ACCT = "0".repeat(63) + "1";
async function q(asset: string, dest: string, amount: string, recipient: string) {
  const r = await fetch("https://1click.chaindefuser.com/v0/quote", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${JWT}` },
    body: JSON.stringify({ dry: true, swapType: "EXACT_INPUT", slippageTolerance: 100, originAsset: asset, depositType: "INTENTS", destinationAsset: dest, amount,
      recipient, recipientType: "DESTINATION_CHAIN", refundTo: ACCT, refundType: "INTENTS", deadline: new Date(Date.now() + 6e5).toISOString() }),
  });
  const j = await r.json();
  return r.ok ? `ok → ${j.quote.amountOutFormatted} ($${Number(j.quote.amountOutUsd).toFixed(2)}) ~${j.quote.timeEstimate}s` : `HTTP ${r.status} ${j.message}`;
}
async function main() {
  const EVM = "0x742d35Cc6634C0532925a3b844Bc454e4438f44e";
  const TSLA = "nep141:bnb-0x2494b603319d4d9f9715c9f4496d9e0364b59d93.omdep.near";
  console.log("TSLAon → TSLAon on BSC:", await q(TSLA, TSLA, "100000000000000000", EVM));
  console.log("ETH (intents) → ETH on Ethereum:", await q("nep141:eth.omft.near", "nep141:eth.omft.near", "20000000000000000", EVM));
  console.log("SOL → SOL on Solana:", await q("nep141:sol.omft.near", "nep141:sol.omft.near", "300000000", "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"));
  console.log("nBTC → BTC on Bitcoin:", await q("nep141:nbtc.bridge.near", "nep141:btc.omft.near", "50000", "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq"));
  console.log("wNEAR → wNEAR on NEAR:", await q("nep141:wrap.near", "nep141:wrap.near", "10000000000000000000000000", "probe.near"));
}
main();

export {};
