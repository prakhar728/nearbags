# Operations

Production runs on Vercel (project `stonkbag`) with a Neon Postgres database.

## Settings

Set in Vercel → Project → Settings → Environment Variables. Never commit them. Add values without a trailing newline:

```sh
printf %s "$VALUE" | vercel env add NAME production
```

| Name | Needed for | Notes |
|---|---|---|
| `DATABASE_URL` | Everything | Postgres connection string |
| `SESSION_SECRET` | Sign-in, share links | Random 64 characters. Changing it signs everyone out and breaks old share links. |
| `CRON_SECRET` | Scheduled jobs | Vercel sends it to the cron routes |
| `ONECLICK_JWT` | Buying and selling | 1Click partner key. Without it, 1Click charges 0.2%. |
| `RELAYER_ACCOUNT_ID`, `RELAYER_PRIVATE_KEY` | Buying and selling | NEAR account that pays gas |
| `PLATFORM_FEE_ACCOUNT` | Platform fee | NEAR account. Without it, no platform fee is charged. |
| `PLATFORM_FEE_BPS` | Platform fee | Default 25 (0.25%) |
| `ADMIN_WALLETS` | `/admin` | Comma-separated NEAR accounts or EVM addresses |
| `TWELVEDATA_API_KEY` | Stock prices | Third stock price source |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | WalletConnect | From cloud.reown.com |
| `EXPLORER_JWT` | `pnpm thesis` only | NEAR Intents Explorer key |
| `FINNHUB_API_KEY`, `NEAR_RPC_URL` | Optional | Backup prices, custom RPC |

## Scheduled jobs

| Job | When (UTC) | Does |
|---|---|---|
| `/api/cron/prices` | 22:30 daily | Adds the latest daily prices and dividends |
| `/api/cron/snapshots` | 23:00 daily | Records each bag's size and holder count |

Both answer 401 unless the request carries `Authorization: Bearer $CRON_SECRET`. Run one by hand:

```sh
curl -H "Authorization: Bearer $CRON_SECRET" https://stonkbag-iota.vercel.app/api/cron/snapshots
```

## Admin

Open `/admin` signed in with a wallet listed in `ADMIN_WALLETS`.

| Control | Effect |
|---|---|
| Pause buys | Stops every new buy. Sells and withdrawals continue. |
| Delist asset | Stops new buys of bags holding that asset |
| Hide bag | Removes a bag from public pages. Holders can still sell and withdraw. |

Every action is written to `audit_log`.

## Local setup

```sh
pnpm install
cp .env.example .env.local   # DATABASE_URL, SESSION_SECRET and CRON_SECRET are enough to browse
pnpm db:migrate
pnpm prices:ingest           # about 2 minutes
pnpm db:seed
pnpm dev
```

| Command | Does |
|---|---|
| `pnpm test` | Unit tests |
| `pnpm lint` | Lint |
| `pnpm prices:ingest` | Fills or tops up prices. Safe to rerun. |
| `pnpm claim-seeds` | Gives the seed bags to their creator account |
| `pnpm thesis` | Rebuilds `THESIS.md` and `/thesis` from the Explorer API |
| `pnpm tsx scripts/verify-keys-mainnet.ts` | Checks key and recovery logic against mainnet, read-only |

Point `.env.local` at the production database to run a script against production.

## Meme coin (Rhea) checks

Read-only, any time: `pnpm tsx --env-file=.env.local --conditions=react-server scripts/probes/rhea-check.ts 20` prints each meme coin's price sources, HOOT's contract check, both-way availability and a dry $20 preflight of a 50/50 bag.

Live test, about $2, signed by you (the script never sends without `--send`):

1. `T="pnpm tsx --env-file=.env.local --conditions=react-server scripts/probes/rhea-live-test.ts"`, then `$T init`. It makes a throwaway test account (key in `.rhea-test-key.json`, gitignored) and prints the command to fund it with 2 USDC.
2. Fund it, then `$T status`: USDC 2.
3. `$T buy HOOT 1`: dry run (quote, allowlist, simulate). Then `$T buy HOOT 1 --send`. Expect `settlement: success` and HOOT in `status`. Open the tx: the `mt_mint` of HOOT goes to the test account.
4. `$T buy NEARLY 0.9 --send`, the same for NEARLY.
5. `$T sell HOOT --send` and `$T sell NEARLY --send`: USDC comes back, about 2% less than went in per round trip.
6. `$T withdraw <you.near> --send`: the USDC goes back to your wallet. Delete `.rhea-test-key.json` once `status` shows zero.

Then once through the app (minimum $20): buy the local NEAR Memes bag, sell 100%, and check Portfolio and History.

## When something breaks

| Symptom | Check | Fix |
|---|---|---|
| Buys stop with "Relayer is not configured" | `RELAYER_*` variables | Set them and redeploy |
| Buys fail with a gas error | The relayer's NEAR balance on nearblocks.io | Send it NEAR |
| Bag stats stop changing | Vercel logs for `/api/cron/prices` | A 401 means `CRON_SECRET` doesn't match. Re-add it without a newline. Then run `pnpm prices:ingest`. |
| One price source fails | The `errors` field the price job returns | Other sources still give a median. Fix the key or wait. |
| A leg is stuck | The order on `/portfolio`, `order_legs.status` | The browser retries legs left quoted for over a minute. Reopen the order page. |
| Buys look risky (bad prices, outage) | | Pause buys in `/admin`. Holders can still sell. |
