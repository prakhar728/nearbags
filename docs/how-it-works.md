# How it works

A **bag** is a list of assets with weights, made by a creator. Buying a bag buys every asset in it at its weight, in one order. Assets are tokenized US stocks and ETFs (Ondo), crypto, USDC and three NEAR meme coins (HOOT, NEARLY and IMEME).

## Terms

| Term | Meaning |
|---|---|
| Bag | A basket: 2 to 10 assets, each 5–50% of the total. |
| Creator | The person who made the bag. Earns their fee on every buy. |
| Position | Your holding in one bag. It sits in its own NEAR Intents account, separate from every other bag you own. |
| Leg | One swap inside an order, for example USDC → Tesla. A buy into a 4-asset bag has 4 legs. |
| Basket key | A key kept in your browser that signs your position's swaps. nearbags' server never sees it. |

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
| Withdraw | Sends the actual tokens to your own addresses, for example Tesla tokens to BNB Chain. You then hold them outside nearbags. Meme coins go to a NEAR account that has held that token before. |

## Meme coins

HOOT, NEARLY and IMEME are NEAR launchpad coins, picked by hand: over $50k market cap, at least $20k in their pool, and no transfer tax. NEAR Intents' swap network doesn't trade them, so their legs swap on **Rhea**, a NEAR exchange, straight from your position account: you sign one swap, Rhea fills it from its pool and sends the coins back to the same account. Nothing else changes: same keys, same account, same steps.

- **High risk.** Each pool holds about $100k. Prices can move 5–10% in minutes and halve in weeks.
- **About 1–1.5% per swap**, mostly the pool's 1% fee.
- **Crypto and cash only.** A bag can mix meme coins with crypto and USDC, not with stocks or ETFs. Stocks pause outside US market hours while meme coins trade all the time, so a mixed buy could stall half done.
- **No AI agent.** Agent-managed bags can't hold meme coins yet.
- **HOOT can be upgraded by its team.** If it ever adds a transfer fee or changes its code, buying pauses here. Selling stays open.

## Bags vs liquidity pools

A liquidity pool and a bag can hold the same tokens, but they do opposite jobs. A pool (Uniswap, Balancer, Rhea) is a shop: you put tokens in so traders can swap against them, and they pay you fees. A bag is a closet: you own the tokens and nobody trades against them.

In a pool, every trade moves the mix. When one token rises, traders buy it from the pool cheaply until the pool's price matches the market, so the pool keeps selling what goes up and buying what goes down. A 4-token pool does the same across every pair, like an index fund that traders rebalance for you. That costs you a little each time, called impermanent loss, and the trading fees are meant to make up for it.

$1,000 split evenly, then one token doubles and the rest stay flat:

| | Held in a bag | In a pool, before fees | Difference |
|---|---|---|---|
| 2 tokens, 50/50 | $1,500 | $1,414 | −$86 |
| 4 tokens, 25% each | $1,250 | $1,189 | −$61 |

| | Liquidity pool | nearbags bag |
|---|---|---|
| Your tokens | Pooled with everyone's; you hold a share token | In your own NEAR Intents account; only your keys can move them |
| Who trades them | Any trader, any time | Only you, or the agent if the bag has one and you opt in |
| Rebalancing | Constant, done by traders against you | None unless you press Reset, or the agent moves the weights within its limits |
| Impermanent loss | Yes | No |
| You earn | Trading fees | Nothing; you pay the creator's fee on buys |
| Assets | Whatever has a pool | Ondo stocks (no pools on NEAR; market makers fill them through NEAR Intents), crypto and meme coins |
| Getting in | Get each token yourself on that chain, then deposit | One payment from any chain; every leg is bought for you |

A pool earns yield and gives you one share token you can move or use elsewhere. A bag doesn't: your position is an account, not a token. A bag is for owning a theme without anyone trading against it.

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
Stock tokens trade thinly outside US market hours. If a quote is too far from the market price, the app blocks that leg rather than fill it badly. Meme coins have the same check against their pool's price.

**Isn't this just a liquidity pool?**
No. A pool lets traders swap against your tokens for fees and rebalances you at a cost. A bag holds your tokens in your own account and nobody trades against them. See [Bags vs liquidity pools](how-it-works.md#bags-vs-liquidity-pools).

**Which wallets work?**
NEAR: HOT, Meteor, NEAR Mobile, Intear, OKX, Ledger, MyNearWallet and Nightly, through HOT Connect. EVM: a browser wallet, or WalletConnect (MetaMask, Rainbow and others on a phone, by QR code or link).

**Can I install it on my phone?**
Yes. On Android, tap the install button in the header. On iPhone, open it in Safari, tap Share, then Add to Home Screen. In the installed app, HOT and NEAR Mobile sign most reliably. Wallets that sign in a browser window (Meteor, Intear, MyNearWallet) may not return to the app.

**Can anyone buy?**
Sanctioned regions are blocked. Where Ondo stocks are not allowed (US, Canada and others), only crypto-only bags can be bought. Some regions (EEA, UK, Switzerland, Singapore and others) need a professional-investor confirmation.

**Where can I get help?**
Ask in the [nearbags Telegram group](https://t.me/nearbags). News and new bags go out on [X @nearbags](https://x.com/nearbags). For a bug, send the bag's name, what you did, and the order link or transaction hash. Admins never message you first, and nobody from nearbags will ask for your seed phrase or keys.

**What if I lose my browser?**
Sign in on the new device. Your wallet signs once to authorise a new browser key. See [Safety and custody](safety.md).
