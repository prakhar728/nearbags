# Thesis: tokenized US stocks on NEAR Intents

<!-- Source for THESIS.md. `pnpm thesis` fills every double-brace placeholder from data/thesis/thesis.json and fails on any
     placeholder it does not know, so no number here is typed by hand. Edit this file, not THESIS.md. -->

Data built {{generated_at}}, covering {{data_since}} to {{data_until}}. Charts: `/thesis` in the app.

## Claim

People will buy US stocks through NEAR Intents, but the demand only shows up when an app packages it, and it fades when the app stops pushing. The rails work. What is missing is a reason to come back.

So the opportunity is distribution: products that turn "swap into a stock token" into something people hold and return to. Stonkbag's bet is creator baskets: a theme you can buy in one step, from any chain, with a reason to check it again.

## What we first claimed, and why we dropped it

We started from "tokenized US stocks are becoming a real use of NEAR Intents", and wrote down beforehand what would change our mind: Ondo's share of 1Click volume falling week after week for a month. That has happened.

- Ondo swaps peaked at {{peak_week_volume}} in the week of {{peak_week}}, from {{peak_week_traders}} traders. The latest full week ({{latest_full_week}}) saw {{latest_full_week_volume}}, {{volume_change_from_peak}} from the peak.
- The last 30 days saw {{ondo_volume_30d}} from {{ondo_traders_30d}} traders, against {{ondo_volume_prev_30d}} in the 30 days before ({{ondo_volume_change_30d}}).
- At its peak, Ondo was {{ondo_share_peak}} of all 1Click USD volume (week of {{ondo_share_peak_week}}). In the week of {{ondo_share_latest_week}} it was {{ondo_share_latest}}.

As stated, the original claim is false today.

## Evidence for the new claim

- **One app made the spike.** 1Click records which app routed each swap. `{{top_app}}` routed {{top_app_swap_share}} of all Ondo swaps and {{top_app_volume_share}} of the volume, active from {{top_app_first_week}} to {{top_app_last_week}}. Its first week lines up with NEAR and Ondo announcing tokenized stocks on near.com ([23 September](https://www.fxstreet.com/cryptocurrencies/news/near-partners-with-ondo-to-bring-tokenized-us-stocks-etfs-with-confidential-execution-202609231154)); we have not confirmed that the tag is near.com. When that app's flow dried up, so did most of the volume.
- **The demand was real while it lasted.** {{ondo_traders_total}} distinct traders made {{ondo_swaps_total}} swaps worth {{ondo_volume_total}}, across {{apps_count}} apps, in {{weeks_with_ondo_swaps}} different weeks since {{first_ondo_week}}.
- **People use it when brokers can't.** {{weekend_volume_share}} of Ondo volume happened on Saturday or Sunday (UTC), when US exchanges are shut.
- **It is not one stock.** The top asset, {{top_asset}}, was {{top_asset_volume_share}} of volume; the rest is spread across the other tokens.
- **Tickets are retail-sized.** The median swap is {{median_swap_usd}} and {{share_swaps_under_1k}} of swaps are under $1,000. That is the size of someone trying a theme, which is what a basket product sells.

## Evidence against

- **One spike is one data point.** A single app's launch pushing volume up and then fading fits "distribution creates demand". It also fits "a promotion bought some curiosity".
- **Tiny in absolute terms.** Even the peak week was {{ondo_share_peak}} of 1Click volume. Nothing here shows that people want stocks on Intents more than they want crypto on Intents.
- **Few hands.** The 10 largest traders account for {{top10_trader_volume_share}} of Ondo volume.
- **US persons are blocked.** Ondo Global Markets tokens are not offered to US persons, which rules out the largest pool of people who already want US stocks.
- **Bridged liquidity.** The tokens live on BNB Chain and reach Intents through a bridge. Small swaps can fail to fill: stock legs have a minimum size, which in our own tests made partial sells of a small basket impossible.
- **Weekend prices are guesses.** Weekend swaps ({{weekend_swap_share}} of swap count) price a stock whose market is closed. Spreads are wider and Monday's open can gap away from them.
- **Our own numbers prove nothing yet.** Stonkbag routed {{stonkbag_swaps}} Ondo swaps, all of them our own tests. It holds {{stonkbag_tvl}} across {{stonkbag_baskets}} live baskets and {{stonkbag_holders}} holders.
- **What the data does not see.** The Explorer API covers 1Click swaps only. Direct Intents trades that skip 1Click are not counted, in the numerator or the denominator.

## What would change our mind

- A second app launches stock trading on Intents and gets the same spike-then-fade, despite a product built for repeat use. That would say the problem is demand, not packaging.
- Stonkbag baskets get bought once and never topped up or rebalanced: buyers who don't come back.
- Stock-token volume grows steadily without any app pushing it. That would make distribution less of a bottleneck than we think.

## Method

- Source: NEAR Intents Explorer API, `GET https://explorer.near-intents.org/api/v0/transactions`, JWT auth, 1 request per 5 seconds.
- Ondo assets: every stock and ETF in `src/lib/assets.ts` (`nep141:bnb-0x….omdep.near`). Two pulls per token over the whole window: `toTokenId=<id>` (buys) and `fromTokenId=<id>` (sells), `statuses=SUCCESS`, 1000 rows per page, cursor pagination. One id per call: the API ignores all but the last repeated token filter.
- Share of 1Click volume: an unfiltered pull (`minUsdPrice=0`) of the last complete weeks. Ondo volume in that pull divided by all volume in it. Weeks still settling (ended less than 2 days ago) are refetched each run and left out of the share line.
- App: the row's `referral` field, the tag the routing app passes to 1Click. Empty tags are counted as "(none)" and never as the top app.
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
