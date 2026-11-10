# AI agent baskets

A creator can let an AI agent manage a basket's weights. Once a day the agent reads the market and the creator's private strategy, picks new weights within fixed limits, and rebalances every holder who opted in. It runs in sealed hardware on [OutLayer](https://outlayer.ai), and every run comes with a proof of the exact code that ran.

## What holders agree to

Buying an agent basket adds one more key to your basket account: the agent's. Your basket key and your wallet stay on the account with full control, and your wallet can remove the agent's key at any time.

| The agent can | The agent can't |
|---|---|
| Swap between this basket's assets, inside your account | Send funds to any other account |
| Change the basket's target weights within the limits | Add or remove keys on your account |
| Trade at most $100 per swap | Sign anything other than a checked swap |

## Two programs

| Program | Holds a key | Job |
|---|---|---|
| Strategist | No | Asks a model for new weights given the strategy and the market, then clamps them to the limits |
| Signer | Yes, created inside the sealed hardware | Signs one swap at a time, only after checking it |

The signer's key is tied to its exact build. If the code changes, the key changes, and holders would have to opt in again. Nobody can quietly swap in new code and keep trading with the old key.

## What the signer checks before every swap

The swap is a 1Click quote, which the signer looks up at 1Click itself. It signs only if all of these hold:

- the payload is exactly one transfer from your basket account to the quote's deposit address;
- the swap's output, and any refund, go back to your basket account, inside NEAR Intents;
- the token and amount match what the transfer sends;
- both assets are in this basket;
- the quote hasn't been used yet;
- slippage is at most 3%, and the swap is worth at most $100.

The rules are in `agent/rebalancer/src/check.rs`, with unit tests for each refusal.

## Limits on the weights

| Limit | Default | Hard cap |
|---|---|---|
| Any one asset | 5% to 60% | at most 80% |
| Move per asset per run | 15 points | |
| Share of the basket traded per run | 20% | at most 30% |

The model only proposes. The strategist applies the limits in code before anything is used, so a strategy that says "go all in" still gets at most the cap.

## Checking a run

Each decision on a basket's page links to its proofs:

- **Decision proof:** the OutLayer attestation of the strategist run. It shows the code's hash, a hash of the input and output, and an Intel TDX quote.
- **Swap signing proof:** the same for the signer run that signed a swap.

The proofs show which code ran, not that the strategy is good. The strategist and signer source is in `agent/` in this repository.

## Questions

**Does the creator see my account?** No. The agent works from the basket's weights and each account's balances, like the manual rebalance button.

**Can the creator change the limits later?** No. They are set when the basket is created.

**Who pays for the runs?** Stonkbag pays the OutLayer runs and the NEAR gas. Swaps cost what any swap costs. There is no extra fee for agent baskets yet.
