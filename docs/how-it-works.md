# How it works

A **bag** is a list of assets with weights, made by a creator. Buying a bag buys every asset in it at its weight, in one order. Assets are tokenized US stocks and ETFs (Ondo), crypto and USDC.

## Terms

| Term | Meaning |
|---|---|
| Bag | A basket: 2 to 10 assets, each 5–50% of the total. |
| Creator | The person who made the bag. Earns their fee on every buy. |
| Position | Your holding in one bag. It sits in its own NEAR Intents account, separate from every other bag you own. |
| Leg | One swap inside an order, for example USDC → Tesla. A buy into a 4-asset bag has 4 legs. |
| Basket key | A key kept in your browser that signs your position's swaps. Stonkbag's server never sees it. |

## Buying

1. Open a bag, enter an amount and pick what you pay with.
2. **Check prices.** Every leg is quoted. You see the fees and whether each price is close to the market.
3. **Bag it.** Sign once in your wallet. This creates your position account and adds your wallet as a backup key.
4. **Pay.**
   - From a NEAR wallet: one approval in the wallet.
   - Anything else (USDC on Base, ETH, SOL…): send to the deposit address shown.
5. Your payment becomes USDC in your position account. Fees come off, then each leg buys its asset. The page tracks each step.

Each bag has a **minimum buy**, $20 or more. Below it, at least one leg would be too small for the swap network to fill.

## Selling

Pick 25, 50, 75 or 100%, and the token and chain you want to be paid in. Every asset is sold to USDC, then one final swap sends the money to your address.

A partial sell is greyed out when one of its legs would fall under that asset's minimum swap size. A note says which asset. Selling 100% is not limited this way.

## Other actions

| Action | What it does |
|---|---|
| Reset | Sells what has grown above its target weight and buys what has fallen below it. |
| Withdraw | Sends the actual tokens to your own addresses, for example Tesla tokens to BNB Chain. You then hold them outside Stonkbag. |

## Creating a bag

1. Pick assets and weights in **Create**. A backtest updates as you type.
2. Set your fee (0–1% of each buy) and write the thesis: why these assets, the risks, and when you would sell.
3. Your bag goes live once your own first buy completes at or above the minimum.

A creator can close a bag to new buyers. Existing holders can still sell and withdraw. Bags are never deleted.

## Portfolio

- **Holding now:** what your open positions are worth at current prices.
- **Open P&L:** the gain or loss on what you still hold.
- **All-time P&L:** everything, including bags you have already sold.
- A P&L chart, your closed bags, and every trade.

**Share** makes a card with your return on a bag. The numbers are fixed at the moment you share. The dollar amount is hidden unless you tick the box.

## Common questions

**Why was my buy blocked at night or at the weekend?**
Stock tokens trade thinly outside US market hours. If a quote is too far from the market price, the app blocks that leg rather than fill it badly.

**Which wallets work?**
NEAR: HOT, Meteor, NEAR Mobile, Intear, OKX, Ledger, MyNearWallet and Nightly, through HOT Connect. EVM: a browser wallet, or your wallet app's built-in browser on a phone.

**Can I install it on my phone?**
Yes. On Android, tap the install button in the header. On iPhone, open it in Safari, tap Share, then Add to Home Screen. In the installed app, HOT and NEAR Mobile sign most reliably. Wallets that sign in a browser window (Meteor, Intear, MyNearWallet) may not return to the app.

**Can anyone buy?**
Sanctioned regions are blocked. Where Ondo stocks are not allowed (US, Canada and others), only crypto-only bags can be bought. Some regions (EEA, UK, Switzerland, Singapore and others) need a professional-investor confirmation.

**What if I lose my browser?**
Sign in on the new device. Your wallet signs once to authorise a new browser key. See [Safety and custody](safety.md).
