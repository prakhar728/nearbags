# Thesis: tokenized US stocks on NEAR Intents

<!-- Source for THESIS.md. `pnpm thesis` fills every double-brace placeholder from data/thesis/thesis.json and fails on any
     placeholder it does not know, so no number here is typed by hand. Edit this file, not THESIS.md. -->

Data built 2026-11-11 01:53 UTC, covering 2026-05-18 to 2026-11-11. Charts: `/thesis` in the app.

## Claim

People will buy US stocks through NEAR Intents, but the demand only shows up when an app packages it, and it fades when the app stops pushing. The rails work. What is missing is a reason to come back.

So the opportunity is distribution: products that turn "swap into a stock token" into something people hold and return to. nearbags' bet is creator baskets: a theme you can buy in one step, from any chain, with a reason to check it again.

## What we first claimed, and why we dropped it

We started from "tokenized US stocks are becoming a real use of NEAR Intents", and wrote down beforehand what would change our mind: Ondo's share of 1Click volume falling week after week for a month. That has happened.

- Ondo swaps peaked at $48,745 in the week of 2026-09-21, from 150 traders. The latest full week (2026-11-02) saw $1,506, −96.9% from the peak.
- The last 30 days saw $7,116 from 33 traders, against $85,021 in the 30 days before (−91.6%).
- At its peak, Ondo was 0.013% of all 1Click USD volume (week of 2026-09-21). In the week of 2026-11-02 it was 0.00057%.

As stated, the original claim is false today.

## Evidence for the new claim

- **One app made the spike.** 1Click records which app routed each swap. `sonear` routed 55.6% of all Ondo swaps and 49.4% of the volume, active from 2026-09-21 to 2026-11-09. Its first week lines up with NEAR and Ondo announcing tokenized stocks on near.com ([23 September](https://www.fxstreet.com/cryptocurrencies/news/near-partners-with-ondo-to-bring-tokenized-us-stocks-etfs-with-confidential-execution-202609231154)); we have not confirmed that the tag is near.com. When that app's flow dried up, so did most of the volume.
- **The demand was real while it lasted.** 240 distinct traders made 808 swaps worth $93,942, across 9 apps, in 15 different weeks since 2026-07-20.
- **People use it when brokers can't.** 43.4% of Ondo volume happened on Saturday or Sunday (UTC), when US exchanges are shut.
- **It is not one stock.** The top asset, NVDA, was 40.0% of volume; the rest is spread across the other tokens.
- **Tickets are retail-sized.** The median swap is $59 and 99.3% of swaps are under $1,000. That is the size of someone trying a theme, which is what a basket product sells.

## Evidence against

- **One spike is one data point.** A single app's launch pushing volume up and then fading fits "distribution creates demand". It also fits "a promotion bought some curiosity".
- **Tiny in absolute terms.** Even the peak week was 0.013% of 1Click volume. Nothing here shows that people want stocks on Intents more than they want crypto on Intents.
- **Few hands.** The 10 largest traders account for 41.1% of Ondo volume.
- **US persons are blocked.** Ondo Global Markets tokens are not offered to US persons, which rules out the largest pool of people who already want US stocks.
- **Bridged liquidity.** The tokens live on BNB Chain and reach Intents through a bridge. Small swaps can fail to fill: stock legs have a minimum size, which in our own tests made partial sells of a small basket impossible.
- **Weekend prices are guesses.** Weekend swaps (40.5% of swap count) price a stock whose market is closed. Spreads are wider and Monday's open can gap away from them.
- **Our own numbers prove nothing yet.** nearbags routed 5 Ondo swaps, all of them our own tests. It holds $0 across 7 live baskets and 0 holders.
- **What the data does not see.** The Explorer API covers 1Click swaps only. Direct Intents trades that skip 1Click are not counted, in the numerator or the denominator.

## What would change our mind

- A second app launches stock trading on Intents and gets the same spike-then-fade, despite a product built for repeat use. That would say the problem is demand, not packaging.
- nearbags baskets get bought once and never topped up or rebalanced: buyers who don't come back.
- Stock-token volume grows steadily without any app pushing it. That would make distribution less of a bottleneck than we think.

## Method

- Source: NEAR Intents Explorer API, `GET https://explorer.near-intents.org/api/v0/transactions`, JWT auth, 1 request per 5 seconds.
- Ondo assets: every stock and ETF in `src/lib/assets.ts` (`nep141:bnb-0x….omdep.near`). Two pulls per token over the whole window: `toTokenId=<id>` (buys) and `fromTokenId=<id>` (sells), `statuses=SUCCESS`, 1000 rows per page, cursor pagination. One id per call: the API ignores all but the last repeated token filter.
- Share of 1Click volume: an unfiltered pull (`minUsdPrice=0`) of the last complete weeks. Ondo volume in that pull divided by all volume in it. Weeks still settling (ended less than 2 days ago) are refetched each run and left out of the share line.
- App: the row's `referral` field, the tag the routing app passes to 1Click. Empty tags are counted as "(none)" and never as the top app.
- USD size: `amountInUsd` from the API (`amountOutUsd` when that is zero). Trader: `refundTo`, else the first sender, else the recipient. Rows deduplicated by deposit address and memo.
- nearbags TVL: every live basket's position balances on `intents.near`, priced at reference prices (`src/lib/stats.ts`).

## How to reproduce

```sh
pnpm install
echo 'EXPLORER_JWT=...' >> .env.local    # explorer key from partners.near-intents.org
pnpm thesis                              # pulls, caches pages in data/thesis/raw/, writes data/thesis/thesis.json and THESIS.md
pnpm dev                                 # open /thesis
```

Reruns only fetch weeks that are new or still settling. `pnpm thesis --render-only` rebuilds this file from the existing JSON.
