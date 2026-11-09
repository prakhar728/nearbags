# Stonkbag

Creator-made baskets of tokenized US stocks and crypto. Buy a whole basket from any token on any chain in one click through NEAR Intents. Each basket position lives in its own NEAR Intents account that only the buyer controls.

Built at NEAR HACKATHON (2026-11-01 to 2026-11-14), track: Unstoppable DeFi.

**Status: in development.** The full README with try-it steps lands before submission.

## How it works (short)

- Stocks are Ondo Global Markets tokens (e.g. TSLAon) bridged into NEAR Intents; crypto is native Intents assets.
- A buyer pays with any token on any chain. 1Click swaps it into USDC inside a fresh NEAR Intents account created for that basket position, then buys each asset.
- The account is a NEAR implicit account derived from a key that never leaves the buyer's browser. The buyer's wallet key is added as a recovery key.
- Creators set a fee (0–1%) that is paid as an on-chain transfer on each buy.
- Backtests use a median of several price sources and include dividends the way Ondo tokens do (reinvested, net of 30% withholding).

## Run locally

```sh
pnpm install
cp .env.example .env.local   # fill in values
pnpm db:migrate
pnpm prices:ingest           # ~2 minutes: 5 years of prices
pnpm dev
```

## Tests

```sh
pnpm test
```

## License

MIT
