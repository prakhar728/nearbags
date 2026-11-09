// Approved asset list (spec Q4: fixed list, curated).
// Every asset here quoted at < 1.5% cost via 1Click on 2026-11-09 and has a reference ticker with price history.
// Excluded on purpose: AGGon (5.6% cost), Ondo portfolio tokens (MAG7X, BRAIN, YLD*, BLK*: no reference history),
// USDon (no liquidity), native BTC (nep141:btc.omft.near had no liquidity; nBTC is used instead).

export type AssetKind = "stock" | "etf" | "crypto" | "stable";

export interface Asset {
  id: string; // our stable id, e.g. "TSLA"
  name: string;
  kind: AssetKind;
  intentsAssetId: string; // NEAR Intents token id held in basket accounts
  decimals: number;
  refTicker: string; // reference price ticker (stocks: exchange ticker; crypto: base symbol)
  chainNote?: string; // where "withdraw as tokens" delivers
  minLegUsd: number; // smallest single swap solvers quoted (measured 2026-11-09 pre-market) + ~20% margin. Preflight is still the final check.
}

// "Withdraw as tokens" (spec §5.6): which 1Click asset and chain each holding leaves Intents as. Verified 2026-11-09
// with dry quotes (same-token withdrawals). Stocks go to BNB Chain as the Ondo token itself.
export const WITHDRAW: Record<string, { assetId: string; chain: string }> = {
  BTC: { assetId: "nep141:btc.omft.near", chain: "btc" },
  ETH: { assetId: "nep141:eth.omft.near", chain: "eth" },
  SOL: { assetId: "nep141:sol.omft.near", chain: "sol" },
  NEAR: { assetId: "nep141:wrap.near", chain: "near" },
  ZEC: { assetId: "nep141:zec.omft.near", chain: "zec" },
  XRP: { assetId: "nep141:xrp.omft.near", chain: "xrp" },
  DOGE: { assetId: "nep141:doge.omft.near", chain: "doge" },
  SUI: { assetId: "nep141:sui.omft.near", chain: "sui" },
  BNB: { assetId: "nep245:v2_1.omni.hot.tg:56_11111111111111111111", chain: "bsc" },
  USDC: { assetId: "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1", chain: "near" },
};
export function withdrawTarget(a: Asset): { assetId: string; chain: string } {
  return WITHDRAW[a.id] ?? { assetId: a.intentsAssetId, chain: "bsc" };
}

const ondo = (id: string, name: string, kind: "stock" | "etf", bnbAddr: string, minLegUsd: number): Asset => ({
  id,
  name,
  kind,
  intentsAssetId: `nep141:bnb-${bnbAddr}.omdep.near`,
  decimals: 18,
  refTicker: id,
  chainNote: `Ondo ${id}on on BNB Chain`,
  minLegUsd,
});

export const ASSETS: Asset[] = [
  ondo("AAPL", "Apple", "stock", "0x390a684ef9cade28a7ad0dfa61ab1eb3842618c4", 12),
  ondo("AMZN", "Amazon", "stock", "0x4553cfe1c09f37f38b12dc509f676964e392f8fc", 12),
  ondo("CRCL", "Circle", "stock", "0x992879cd8ce0c312d98648875b5a8d6d042cbf34", 12),
  ondo("GOOGL", "Alphabet", "stock", "0x091fc7778e6932d4009b087b191d1ee3bac5729a", 12),
  ondo("HOOD", "Robinhood", "stock", "0x19601179a60f55ff6636f5d1a8b6671053bd60a8", 32),
  ondo("INTC", "Intel", "stock", "0xa528caaa2f96090e379d43f90834c75df54d6e74", 12),
  ondo("META", "Meta", "stock", "0xd7df5863a3e742f0c767768cdfcb63f09e0422f6", 32),
  ondo("MRVL", "Marvell", "stock", "0x1501ec83ffef405b4331cc4f73277a40fb0c627d", 32),
  ondo("MSFT", "Microsoft", "stock", "0x6bfe75d1ad432050ea973c3a3dcd88f02e2444c3", 32),
  ondo("NVDA", "Nvidia", "stock", "0xa9ee28c80f960b889dfbd1902055218cba016f75", 12),
  ondo("TSLA", "Tesla", "stock", "0x2494b603319d4d9f9715c9f4496d9e0364b59d93", 12),
  ondo("SPY", "S&P 500 ETF", "etf", "0x6a708ead771238919d85930b5a0f10454e1c331a", 32),
  ondo("QQQ", "Nasdaq 100 ETF", "etf", "0x0cde6936d305d5b34667fc46425e852efd73559a", 12),
  ondo("GLD", "Gold ETF", "etf", "0xfa9a1e901085e269f6d428f79cd5252d8b919344", 32),
  ondo("IAU", "Gold ETF (iShares)", "etf", "0xcb2a0f46f67dc4c58a316f1c008edef5c2311795", 32),
  ondo("SLV", "Silver ETF", "etf", "0x8b872732b07be325a8803cdb480d9d20b6f8d11b", 32),
  ondo("SGOV", "0-3M T-Bill ETF", "etf", "0xc008c5f579ec1450f20099c39f587547e27c7523", 32),
  ondo("TIP", "TIPS Bond ETF", "etf", "0x2ac26ec236df5d1d2ad1a6dd4e448a90e45dc35d", 35),
  ondo("TLT", "20Y+ Treasury ETF", "etf", "0xf69e40069ac227c11459e3f4e8a446b3401616b6", 32),

  { id: "BTC", name: "Bitcoin", kind: "crypto", intentsAssetId: "nep141:nbtc.bridge.near", decimals: 8, refTicker: "BTC", chainNote: "Bitcoin", minLegUsd: 3 },
  { id: "ETH", name: "Ether", kind: "crypto", intentsAssetId: "nep141:eth.omft.near", decimals: 18, refTicker: "ETH", chainNote: "Ethereum", minLegUsd: 3 },
  { id: "SOL", name: "Solana", kind: "crypto", intentsAssetId: "nep141:sol.omft.near", decimals: 9, refTicker: "SOL", chainNote: "Solana", minLegUsd: 3 },
  { id: "NEAR", name: "NEAR", kind: "crypto", intentsAssetId: "nep141:wrap.near", decimals: 24, refTicker: "NEAR", chainNote: "NEAR", minLegUsd: 3 },
  { id: "ZEC", name: "Zcash", kind: "crypto", intentsAssetId: "nep141:zec.omft.near", decimals: 8, refTicker: "ZEC", chainNote: "Zcash", minLegUsd: 3 },
  { id: "XRP", name: "XRP", kind: "crypto", intentsAssetId: "nep141:xrp.omft.near", decimals: 6, refTicker: "XRP", chainNote: "XRP Ledger", minLegUsd: 3 },
  { id: "DOGE", name: "Dogecoin", kind: "crypto", intentsAssetId: "nep141:doge.omft.near", decimals: 8, refTicker: "DOGE", chainNote: "Dogecoin", minLegUsd: 3 },
  { id: "SUI", name: "Sui", kind: "crypto", intentsAssetId: "nep141:sui.omft.near", decimals: 9, refTicker: "SUI", chainNote: "Sui", minLegUsd: 3 },
  { id: "BNB", name: "BNB", kind: "crypto", intentsAssetId: "nep245:v2_1.omni.hot.tg:56_11111111111111111111", decimals: 18, refTicker: "BNB", chainNote: "BNB Chain", minLegUsd: 3 },
  { id: "USDC", name: "USD Coin", kind: "stable", intentsAssetId: "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1", decimals: 6, refTicker: "USDC", chainNote: "NEAR", minLegUsd: 0 },
];

export const USDC = ASSETS.find((a) => a.id === "USDC")!;
export const BENCHMARKS = ["SPY", "BTC"] as const;

const byId = new Map(ASSETS.map((a) => [a.id, a]));
export function getAsset(id: string): Asset {
  const a = byId.get(id);
  if (!a) throw new Error(`Unknown asset: ${id}`);
  return a;
}
export const isMarketAsset = (a: Asset) => a.kind === "stock" || a.kind === "etf";
