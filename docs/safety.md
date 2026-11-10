# Safety and custody

**Stonkbag cannot move your money.** Each position is a NEAR Intents account that only two keys control: your browser's basket key and your wallet.

## Keys

| Key | Where it lives | What it does |
|---|---|---|
| Basket key | Your browser, encrypted | Signs the swaps for your position |
| Your wallet | Your wallet app | Backup. Added to every position before you pay. Can move the funds at any time, with or without Stonkbag. |

- **Same browser:** nothing to do.
- **New browser:** sign in, and your wallet signs once to authorise a new basket key.
- **Stonkbag goes offline:** your wallet's key is on every position account in `intents.near`, so it can still sign withdrawals directly.

## What the server can and can't do

| Can | Can't |
|---|---|
| Ask for quotes and track your order | Sign anything for you |
| Pay NEAR gas for swaps you already signed | Change a swap you signed |
| Refuse a swap that doesn't match its quote | Send your funds anywhere |

Before relaying anything, the server checks that it matches what it expected, byte for byte. Fee transfers must match the order exactly. Every batch is test-run on chain before it is sent.

## Checks on every buy

| Check | Rule |
|---|---|
| Price check | Each quote is compared with the market price from several sources. Over 1.5% off: warning. Over 5%: blocked. Outside US hours for stocks: 3% and 8%. |
| Swap limit | No leg can lose more than 1% to price movement while it fills. |
| Minimum size | Legs too small to fill are stopped before you pay. |
| Refunds | If a deposit or a swap can't complete, the money goes back: to your refund address, or to your position account. |
| Regions | Sanctioned regions blocked. Stock bags blocked where Ondo doesn't allow them. |

## Admin controls

Admins can pause all buys, stop new buys of one asset, or hide a bag. Sells and withdrawals always keep working. Every admin action is logged. Admins can't edit a bag or touch positions.

## Limits

- Region rules use location and self-confirmation, not identity checks.
- Ondo stock tokens follow Ondo's terms. They are not for US persons.
