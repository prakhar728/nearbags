# AI agent baskets

A creator can let an agent manage a basket's weights. Once a day the agent works out the weights, either by a rule the creator picked from a list or by the creator's own private strategy for an AI model, and rebalances every holder who opted in. It runs in sealed hardware on [OutLayer](https://outlayer.ai), and every run comes with a proof of the exact code that ran.

## Choosing how the agent decides

When creating an agent basket, the creator picks one of six rules, or writes their own strategy for the AI.

| Strategy | What it does | Weights recomputed | Needs USDC |
|---|---|---|---|
| Fixed Mix | Keeps the creator's weights and fixes drift | Never | No |
| Equal Weight | Gives every asset the same share | Never | No |
| Risk Balanced | Gives steadier assets more and wilder ones less | Monthly | No |
| Trend Guard | Moves an asset to USDC while it's below its moving average | Daily | Yes |
| Volatility Target | Holds more USDC when the basket has been swinging hard | Daily | Yes |
| Momentum Tilt | Leans toward recent winners | Monthly | No |
| Your own strategy | An AI model follows the creator's written strategy | Daily | No |

A rule is public: holders see its name and how it works on the basket page. A written strategy stays private to the creator and the agent.

### How each rule works

**Fixed Mix**
The targets stay at the creator's weights. The agent only fixes drift (see below).

**Equal Weight**
Every asset's target is the same share. Research finds plain equal weights hard to beat, because nothing has to be estimated.

**Risk Balanced**
Once a month, each asset's share is set in inverse proportion to how much its price swung over the last 90 days, with recent days counting more. The new targets move only half way from the old ones, so one noisy month can't swing the basket. USDC keeps its starting share.

**Trend Guard**
An asset stays in while its price is above its average of the last 100 days (crypto) or about 200 trading days (stocks). When it falls more than 3% below that average, its share moves to USDC. It comes back once it is 3% above. The buffer stops it flipping back and forth. This cuts deep falls, but it can lag at turning points and lose a little in sideways markets.

**Volatility Target**
The agent measures how much the whole basket swung over the last 30 days. If that is above a target (40% a year for baskets with crypto, 15% for stock-only baskets), it holds less of the risky assets and more USDC, keeping at least 20% invested. It changes the amount only when it moves by more than 10 points.

**Momentum Tilt**
Once a month, each asset is scored on its 30- and 90-day return for the risk it took. Leaders get up to half again their starting weight, laggards down to half. If the basket holds USDC, an asset that is down over 90 days moves to USDC. This trades the most, and suffers most when markets turn.

### When a rule trades

The rules don't trade every day. Each day the agent checks every holder, and trades only when some asset has drifted outside its band. A band is a quarter of the asset's target, at most 5 points either way. It is never smaller than one and a half times the asset's smallest swap, so a breach can actually be traded. Research on rebalancing finds that trading on bands like these beats trading on a fixed calendar once costs are counted.

Every rule's weights still pass through the limits below. A big change, such as Trend Guard moving an asset to USDC, happens over a few days if it is larger than one run may move. Assets can't go under the 5% floor, so an asset that is "out" keeps 5%.

### Your own strategy

The model gets each asset's price, its 1-, 7-, 30- and 90-day change, its 90-day volatility, and how far it sits from its 100-day average. It proposes weights with a one-sentence reason. If the model can't be reached or answers nonsense, the run keeps the current weights.

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
| Strategist | No | Works out new weights from the rule (or asks a model, given the written strategy), then clamps them to the limits |
| Signer | Yes, created inside the sealed hardware | Signs one swap at a time, only after checking it |

The signer's key is tied to its exact build. If the code changes, the key changes, and holders would have to opt in again. Nobody can quietly swap in new code and keep trading with the old key.

## What the signer checks before every swap

The swap is a 1Click quote, which the signer looks up at 1Click itself. It signs only if all of these hold:

- the payload is exactly one transfer from your basket account to the quote's deposit address;
- the swap's output, and any refund, go back to your basket account, inside NEAR Intents;
- the token and amount match what the transfer sends;
- both assets are in this basket;
- the quote hasn't been used yet;
- slippage is at most 3%, and the swap is worth at most $100;
- the quote pays at most 0.3% in app fees, all recipients together (1Click itself takes 0.2%);
- by 1Click's own dollar prices, the swap gives back at least 97% of what it takes, whatever our server says the market is.

It also limits how often it trades: at most 24 agent swaps per account per day. The limit needs no database. Each day an account gets 24 nonces worked out from the account and the date, the signer only signs with one that NEAR Intents hasn't seen, and NEAR Intents never accepts a nonce twice.

The signer can also sign a swap on Rhea, for meme coins. It checks that the swap goes to Rhea's DCL contract through a fixed list of pools, that the output comes straight back to your account, that one side is USDC, and that the minimum it accepts is within 3% of a fresh quote it reads from the chain itself. Adding a pool to that list takes a new build, which means a new key.

The rules are in `agent/rebalancer/src/` (`check.rs`, `rhea.rs`, `daily.rs`), with unit tests for each refusal.

## Limits on the weights

| Limit | Default | Hard cap |
|---|---|---|
| Any one asset | 5% to 60% | at most 80% |
| Move per asset per run | 15 points | |
| Share of the basket traded per run | 20% | at most 30% |

Rules and the model only propose. The strategist applies the limits in code before anything is used, so a strategy that says "go all in" still gets at most the cap.

## Checking a run

Each decision on a basket's page links to its proofs:

- **Decision proof:** the OutLayer attestation of the strategist run. It shows the code's hash, a hash of the input and output, and an Intel TDX quote. For a rule, this proves the published rule's code produced the weights.
- **Swap signing proof:** the same for the signer run that signed a swap.

The proofs show which code ran, not that the strategy is good. The strategist and signer source is in `agent/` in this repository.

## Questions

**Does the creator see my account?** No. The agent works from the basket's weights and each account's balances, like the manual rebalance button.

**Can the creator change the limits later?** No. They are set when the basket is created, and so is the strategy.

**Which rule should I pick?** If unsure, Equal Weight or Fixed Mix. They trade least and have the strongest evidence behind them. The others aim to cut losses or follow trends, and they trade more, so swap costs eat more of the result.

**Who pays for the runs?** nearbags pays the OutLayer runs and the NEAR gas. Swaps cost what any swap costs. There is no extra fee for agent baskets yet.
