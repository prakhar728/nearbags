# Thesis: tokenized US stocks on NEAR Intents

<!-- Source for THESIS.md. `pnpm thesis` fills every double-brace placeholder from data/thesis/thesis.json and fails on any
     placeholder it does not know, so no number here is typed by hand. Edit this file, not THESIS.md. -->

Data built {{generated_at}}, covering {{data_since}} to {{data_until}}. Charts: `/thesis` in the app.

## Claim

Tokenized US stocks are becoming a real use of NEAR Intents.

"Real use" means: people other than us swap into and out of Ondo stock and ETF tokens through 1Click, week after week, and that activity is a growing part of what 1Click does.

## Evidence for

- In the last 30 days, {{ondo_traders_30d}} distinct traders made {{ondo_swaps_30d}} Ondo swaps worth {{ondo_volume_30d}}. The 30 days before that saw {{ondo_volume_prev_30d}} ({{ondo_volume_change_30d}}).
- Over the whole window: {{ondo_swaps_total}} swaps, {{ondo_volume_total}}, {{ondo_traders_total}} traders. Weeks with at least one Ondo swap: {{weeks_with_ondo_swaps}}, the first being {{first_ondo_week}}.
- Ondo swaps were {{ondo_share_latest}} of all 1Click USD volume in the week of {{ondo_share_latest_week}}, against {{ondo_share_first}} in the week of {{ondo_share_first_week}} ({{weeks_measured_vs_1click}} weeks measured).
- Activity is not one asset: the top asset, {{top_asset}}, was {{top_asset_volume_share}} of Ondo volume.
- {{weekend_volume_share}} of Ondo volume happened on Saturday or Sunday (UTC), when US exchanges are shut. That is something a brokerage account cannot do.
- Stonkbag itself holds {{stonkbag_tvl}} across {{stonkbag_baskets}} live baskets and {{stonkbag_holders}} holders.

## Evidence against

- **Small in absolute terms.** {{ondo_volume_30d}} in 30 days is small next to any stock exchange and next to the rest of 1Click; the share figure above says how small.
- **Few hands.** The 10 largest traders account for {{top10_trader_volume_share}} of Ondo volume. A handful of wallets (including ours, testing) can make a trend look bigger than it is.
- **Small tickets.** The median swap is {{median_swap_usd}} and {{share_swaps_under_1k}} of swaps are under $1,000. The largest was {{largest_swap_usd}}. That fits testing and curiosity as well as it fits investing.
- **US persons are blocked.** Ondo Global Markets tokens are not offered to US persons, which rules out the largest pool of people who already want US stocks.
- **Bridged liquidity.** The tokens live on BNB Chain and reach Intents through a bridge. Solvers need inventory on both sides, so small swaps can fail to fill and large ones cost more than buying the stock at a broker.
- **Weekend prices are guesses.** Swaps on weekends ({{weekend_swap_share}} of swap count) price a stock whose market is closed. Spreads are wider and Monday's open can gap away from them.
- **Our own TVL proves little.** Stonkbag's number includes baskets we seeded ourselves.
- **What the data does not see.** The Explorer API covers 1Click swaps only. Direct Intents trades that skip 1Click are not counted, in the numerator or the denominator.

## What would change our mind

- Ondo's share of 1Click volume falls week after week for a full month while 1Click itself grows.
- The 30-day trader count stops growing, or most volume keeps coming from the same ten wallets.
- Swaps that touch Ondo tokens get refunded or fail to quote often enough that people stop trying.
- Volume only shows up around our own launch and testing dates, and is gone afterwards.

## Method

- Source: NEAR Intents Explorer API, `GET https://explorer.near-intents.org/api/v0/transactions`, JWT auth, 1 request per 5 seconds.
- Ondo assets: every stock and ETF in `src/lib/assets.ts` (`nep141:bnb-0x….omdep.near`). Two pulls per UTC week: `toTokenId=<each id>` (buys) and `fromTokenId=<each id>` (sells), `statuses=SUCCESS`, 1000 rows per page, cursor pagination.
- Share of 1Click volume: an unfiltered pull (`minUsdPrice=0`) of the last complete weeks. Ondo volume in that pull divided by all volume in it. Weeks still settling (ended less than 2 days ago) are refetched each run and left out of the share line.
- USD size: `amountInUsd` from the API (`amountOutUsd` when that is zero). Trader: `refundTo`, else the first sender, else the recipient. Rows deduplicated by deposit address and memo.
- Stonkbag TVL: every live basket's position balances on `intents.near`, priced at reference prices (`src/lib/stats.ts`).

## How to reproduce

```sh
pnpm install
echo 'EXPLORER_JWT=...' >> .env.local    # explorer key from partners.near-intents.org
pnpm thesis                              # pulls, caches pages in data/thesis/raw/, writes data/thesis/thesis.json and THESIS.md
pnpm dev                                 # open /thesis
```

Reruns only fetch weeks that are new or still settling. `pnpm thesis --render-only` rebuilds this file from the existing JSON.
