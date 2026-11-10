# Prices and numbers

## What is live and what is daily

| Number | Source | Updates |
|---|---|---|
| Quotes when you buy or sell | 1Click, from market makers | Live |
| Price check | Median of several price sources | Live |
| Portfolio value | Your on-chain balances × current prices | Live |
| Backtests on bag pages (return, drawdown, Sharpe…) | Daily closing prices | Once a day, 22:30 UTC. Pages may show figures up to an hour old. |
| Bag size and holder count | Daily snapshot | Once a day, 23:00 UTC |
| Shared P&L cards | Your position when you shared | Never. Fixed on purpose. |

## Price sources

| Assets | Sources |
|---|---|
| Stocks and ETFs | Yahoo, Nasdaq, Twelve Data |
| Crypto | Binance, Coinbase, Kraken, CoinGecko |

Each day's price is the median across sources. Days where sources disagree by more than 0.5% are flagged.

An Ondo token holds slightly more than one share because dividends are paid in as extra shares. Prices for Ondo tokens are the share price times that ratio.

## Backtests

- Dividends are reinvested after 30% US withholding tax, as Ondo tokens do.
- "Hold" keeps the starting units. "Rebalanced monthly" resets to target weights each month.
- Up to 5 years. The backtest starts on the first day every asset in the bag has a price, so a bag with a newly listed asset has a shorter history.
- A backtest is past performance with hindsight. It is not a forecast.

## Trade history and P&L

- **Money in:** what each deposit was worth when it arrived.
- **Money out:** what each sell paid out, plus withdrawn tokens at that day's price.
- The chart has one point per order, valued at that day's closing prices.

## Investment thesis

`/thesis` and [THESIS.md](../THESIS.md) use every 1Click swap of an Ondo stock, from the NEAR Intents Explorer API. `pnpm thesis` downloads the raw data again and rebuilds every number.
