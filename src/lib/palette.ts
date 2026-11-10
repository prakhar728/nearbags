// Chart colors for the light, near.com-style theme. Green = the basket (a darker green than the UI's bright fill, so a
// line on white keeps 3:1 contrast). Benchmarks stay grey. Assets get a categorical set from near.com's palette that
// avoids greens and reds (those are reserved for the basket and for returns).
export const ASSET_COLORS = ["#3080ff", "#8d54ff", "#00a5ef", "#f99c00", "#e12afb", "#fe6e00", "#1447e6", "#a600b5", "#b75000", "#737373"];
export const assetColor = (i: number) => ASSET_COLORS[i % ASSET_COLORS.length];
export const BENCH = { SPY: "#737373", BTC: "#a3a3a3" } as const;
export const CHART = {
  basket: "#009660", // green-700
  basketSoft: "#9fdcc0", // the basket line while another line is highlighted
  monthly: "#00c076", // dashed monthly-rebalanced variant
  dim: "#e5e5e5", // un-highlighted lines
  second: "#a3a3a3",
} as const;
