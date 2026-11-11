# Fees

| Cost | Paid to | On | Amount |
|---|---|---|---|
| Creator fee | The bag's creator | Buys only | 0–1%, set by the creator |
| Platform fee | nearbags | Buys only | 0.25%, or 0.5% on AI agent baskets |
| Agent swap fee | nearbags | Each swap the AI agent makes | 0.1% (a 1Click app fee of 0.2%, half of which 1Click keeps) |
| 1Click fee | 1Click | Every 1Click swap | 0.2%, included in the quote |
| Swap cost | The market makers who fill each swap | Every swap | The gap between the quote and the market price. Capped at 1% per leg. |
| Meme coin swap cost | Rhea's pool (its 1% fee) and price impact | Every HOOT, NEARLY or IMEME swap | About 1–1.5% at $10–$250, more on bigger swaps. Capped at 2% below the quote. |
| NEAR gas | nearbags' gas account | Every on-chain step | Free to you |
| Network fee | The chain you pay from | Your deposit | Whatever your wallet shows |
| NEAR storage | NEAR | Paying from a NEAR wallet | 0.00125 NEAR, once per deposit |

Selling has no nearbags fees. You only pay the swap cost.

The smallest buy is $20, or $25 for a bag with meme coins (nearbags pays the gas for each Rhea swap). A bag whose assets have bigger minimum swaps asks for more; the buy panel shows the exact minimum.

**Why do agent baskets cost more?** nearbags pays for the agent: a sealed-hardware run every day for each agent basket, and another for every swap it signs. The higher buy fee and the 0.1% on agent swaps cover that. The agent's key still can only swap inside your account; the fee is part of the swap quote, not a transfer the agent makes.

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

A meme coin round trip costs more: on 2026-11-11 a $10 buy and sell of HOOT, NEARLY or IMEME came back as about $9.80 (2%), before creator and platform fees.

## Where fees go

- The creator fee goes to the creator's wallet balance in NEAR Intents. If their wallet can't receive it, it goes to the platform account.
- The platform fee goes to the platform account's NEAR Intents balance.
