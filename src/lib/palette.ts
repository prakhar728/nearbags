// Chart colors. Accent = the basket. Benchmarks stay grey. Assets get a restrained categorical set that
// avoids the gain/loss greens and reds (those are reserved for returns).
export const ASSET_COLORS = ["#7aa7ff", "#c49bff", "#5fc9d6", "#e8b25c", "#e58fc8", "#9fb0c8", "#ff9f6e", "#8c8cff", "#cbb994", "#d6d6d6"];
export const assetColor = (i: number) => ASSET_COLORS[i % ASSET_COLORS.length];
export const BENCH = { SPY: "#8a8a8a", BTC: "#5a5a5a" } as const;
