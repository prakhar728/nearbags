# Fees

| Cost | Paid to | On | Amount |
|---|---|---|---|
| Creator fee | The bag's creator | Buys only | 0–1%, set by the creator |
| Platform fee | Stonkbag | Buys only | 0.25% |
| Swap cost | The market makers who fill each swap | Every swap | The gap between the quote and the market price. Capped at 1% per leg. |
| NEAR gas | Stonkbag's gas account | Every on-chain step | Free to you |
| Network fee | The chain you pay from | Your deposit | Whatever your wallet shows |
| NEAR storage | NEAR | Paying from a NEAR wallet | 0.00125 NEAR, once per deposit |

Selling has no Stonkbag fees. You only pay the swap cost.

## A real example

A $50 buy and full sell of Degen Mix (Tesla, Circle, SOL, NEAR; 0.5% creator fee) on mainnet, November 2026.

| | |
|---|---|
| Paid in | $50.00 USDC |
| Creator fee | $0.25 |
| Platform fee | $0.125 |
| Swap costs, buy and sell | about $0.58 |
| Paid out | $49.05 USDC |
| **Round-trip cost** | **$0.95 (1.9%)** |

Swap costs are higher for small orders and outside US market hours.

## Where fees go

- The creator fee goes to the creator's wallet balance in NEAR Intents. If their wallet can't receive it, it goes to the platform account.
- The platform fee goes to the platform account's NEAR Intents balance.
