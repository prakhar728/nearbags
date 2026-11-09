// Shapes for the thesis track. ExplorerTx mirrors the fields of GET /api/v0/transactions we use (all strings/numbers as
// the API returns them); ThesisData is what `pnpm thesis` writes to data/thesis/thesis.json.

export interface ExplorerTx {
  originAsset: string;
  destinationAsset: string;
  depositAddress: string;
  depositMemo: string | null;
  recipient: string;
  status: string;
  createdAt: string;
  createdAtTimestamp: number; // Unix seconds
  amountInUsd: string;
  amountOutUsd: string;
  refundTo?: string;
  senders?: string[];
}

export interface WeekRow {
  week: string; // Monday, YYYY-MM-DD (UTC)
  ondoSwaps: number;
  ondoVolumeUsd: number;
  ondoTraders: number;
  buys: number;
  sells: number;
  /** Null when that week's unfiltered 1Click pull is missing or incomplete. */
  allSwaps: number | null;
  allVolumeUsd: number | null;
  ondoShare: number | null; // Ondo USD volume / all USD volume, both from the unfiltered pull
}

export interface DayRow {
  day: string; // Mon..Sun
  swaps: number;
  volumeUsd: number;
}

export interface SizeBucket {
  label: string;
  minUsd: number;
  maxUsd: number | null;
  swaps: number;
  volumeUsd: number;
}

export interface AssetRow {
  symbol: string;
  assetId: string;
  swaps: number;
  volumeUsd: number;
  buys: number;
  sells: number;
}

export interface WeekTotals {
  week: string;
  swaps: number;
  volumeUsd: number;
  ondoSwaps: number;
  ondoVolumeUsd: number;
}

export interface StonkbagTvl {
  at: string;
  tvlUsd: number;
  baskets: number;
  holders: number;
  history: { date: string; tvlUsd: number }[]; // daily sum of the latest snapshot per basket
}

export interface ThesisSummary {
  data_since: string | null;
  data_until: string | null;
  ondo_swaps_total: number;
  ondo_volume_total: number;
  ondo_traders_total: number;
  ondo_swaps_30d: number;
  ondo_volume_30d: number;
  ondo_traders_30d: number;
  ondo_volume_prev_30d: number;
  ondo_volume_change_30d: number | null; // fraction, e.g. 0.25 = +25%
  weeks_with_ondo_swaps: number;
  first_ondo_week: string | null;
  weeks_measured_vs_1click: number;
  ondo_share_latest: number | null;
  ondo_share_latest_week: string | null;
  ondo_share_first: number | null;
  ondo_share_first_week: string | null;
  weekend_volume_share: number | null;
  weekend_swap_share: number | null;
  median_swap_usd: number | null;
  share_swaps_under_1k: number | null;
  largest_swap_usd: number | null;
  top_asset: string | null;
  top_asset_volume_share: number | null;
  top10_trader_volume_share: number | null;
  stonkbag_tvl: number | null;
  stonkbag_baskets: number | null;
  stonkbag_holders: number | null;
}

export interface ThesisData {
  version: 1;
  generatedAt: string;
  asOf: string; // the "now" used for 30-day windows
  source: {
    api: string;
    statuses: string;
    ondoAssetIds: string[];
    weeksRequested: { ondo: string[]; all: string[] };
    requests: number; // HTTP requests made this run (cached pages not counted)
  };
  weekly: WeekRow[];
  byDay: DayRow[];
  sizes: SizeBucket[];
  assets: AssetRow[];
  summary: ThesisSummary;
  stonkbag: StonkbagTvl | null;
  stonkbagNote: string | null; // why stonkbag is null, if it is
}
