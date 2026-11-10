# Safety and custody

**nearbags cannot move your money.** Each position is a NEAR Intents account that only two keys control: your browser's basket key and your wallet.

## Keys

| Key | Where it lives | What it does |
|---|---|---|
| Basket key | Your browser, encrypted | Signs the swaps for your position |
| Your wallet | Your wallet app | Backup. Added to every position before you pay. Can move the funds at any time, with or without nearbags. |

- **Same browser:** nothing to do.
- **New browser:** sign in, and your wallet signs once to authorise a new basket key.
- **nearbags goes offline:** your wallet's key is on every position account in `intents.near`, so it can still sign withdrawals directly.

## What the server can and can't do

| Can | Can't |
|---|---|
| Ask for quotes and track your order | Sign anything for you |
| Pay NEAR gas for swaps you already signed | Change a swap you signed |
| Relay a meme coin swap you signed to Rhea | Send a Rhea swap's output anywhere but your own account |
| Refuse a swap that doesn't match its quote | Send your funds anywhere |

Before relaying anything, the server checks that it matches what it expected, byte for byte. Fee transfers must match the order exactly. Every batch is test-run on chain before it is sent.

Meme coin swaps get a stricter check: one withdrawal to Rhea's swap contract only, only through approved pools, the planned token and amount, a minimum out no lower than planned, and the output addressed back to the same position account. Anything else is refused.

## Checks on every buy

| Check | Rule |
|---|---|
| Price check | Each quote is compared with the market price from several sources. Over 1.5% off: warning. Over 5%: blocked. Outside US hours for stocks: 3% and 8%. |
| Swap limit | No leg can lose more than 1% to price movement while it fills. Meme coins: 2%. |
| Meme coin price check | Compared with the pool's own price: over 2% warning, over 5% blocked. Buys wait if the pool is over 10% away from recent trades. |
| Meme coin contract | HOOT's contract can be upgraded. Before buys we check it has no transfer fee and the code we reviewed; if not, buying pauses and selling stays open. |
| Minimum size | Legs too small to fill are stopped before you pay. |
| Refunds | If a deposit or a swap can't complete, the money goes back: to your refund address, or to your position account. |
| Regions | Sanctioned regions blocked. Stock bags blocked where Ondo doesn't allow them. |

## Admin controls

Admins can pause all buys, stop new buys of one asset, or hide a bag. Sells and withdrawals always keep working. Every admin action is logged. Admins can't edit a bag or touch positions.

## Limits

- Region rules use location and self-confirmation, not identity checks.
- Ondo stock tokens follow Ondo's terms. They are not for US persons.
- Meme coins depend on Rhea and on each coin's contract. Rhea could change who may swap from NEAR Intents; HOOT's team can upgrade its token.
