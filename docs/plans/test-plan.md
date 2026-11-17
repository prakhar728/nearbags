# Test plan for features 1–5 (written 2026-11-15)

Two rounds:

- **Round 1, before anything ships:** the local server (`stonkbag-next`, port 3093, local Postgres) against **mainnet**. Real money, small amounts. The production database is never touched.
- **Round 2, on each ship day:** a short check on nearbags.com right after that feature deploys.

Who does what:

- **Claude:** setup, the free checks, reading balances on chain, and confirming each step's result.
- **You:**
  - every wallet signature, payment, buy, sell, claim and take-back;
  - running the agent script.
- Update `intents-baskets/FUNDS.md` after every money step.

## Wallets

| | Wallet | Local user | Role |
|---|---|---|---|
| A | `testing69.near` | 9 | Creator. Owns the test bag, the treasury and the agent key. |
| B | `0x91Bd…` (EVM) | 2 | Buyer. Sends both gifts, so creator fees flow to A's treasury. |
| C | `chillguyy.near` | 14 | Receives gift 1. |

C, not A, receives gift 1. If A claimed it, the gift would merge into A's own position for that bag, and that position is A's treasury.

Wallet B pays with USDC on Arbitrum. The agent's deposit also comes from B.

## Budget

| Step | Locked up | Comes back by the end |
|---|---|---|
| A's self-buy (becomes the treasury) | $20 | Stays as A's treasury |
| B's gift 1, claimed by C | $20 | C sells it |
| B's gift 2, taken back by B | $20 | B sells it |
| Agent buy, then sell 100% | $20 | Paid to A's wallet |

About $80 moves in total. Fees and slippage should cost under $2.

Creator fees are 0 when a creator buys their own bag (`orders.ts`, `markFunded`). That's why B buys the gifts.

## Rules

- **Stop on the first surprise.**
  - Write down the order id and the account.
  - Don't retry until we know where the money is.
- **Pick bags with nothing paused.**
  - At 2026-11-15 ~16:30 UTC these couldn't be bought: HOOD, BNB, SGOV, TIP, TLT, IAU.
  - These couldn't be sold: SGOV, TIP, TLT, SLV, GLD, IAU.
  - Recheck `/api/assets/paused` before each money step.
- **If 1Click errors on quotes** (as at 15:50 UTC today), wait and recheck. Don't change code for it.
- **Leave nothing behind in local-only accounts.** Production's database won't know about them. Your wallet can still recover each one, but only by hand.

---

## Round 1: local, against mainnet

### 0. Setup (Claude, no money)

1. Restart the 3093 server so it loads the newest schema, and stop the old servers on 3091 and 3092.
2. Rerun the 150 tests, tsc and lint.
3. Clear the leftover test data:
   - user 12's fake wallet key;
   - gift `yth4rkiamxmn`;
   - agent position 7;
   - the "Sources Test" bag;
   - A's treasury row on the house bag.
4. **You** sign in on `http://localhost:3093` with wallets A, B and C in turn. Signing in stores each wallet's real key. Recovery keys and claims depend on it.
5. Write `scratchpad/agent-trade.mjs`. It runs the agent flow from `docs/agents.md`: one command per step, a fresh agent key, and it prints what it's about to sign. **You** run it.

### 1. Sources (no money)

Connect Claude Code to the local MCP with a local agent key for A:

```
claude mcp add --transport http nearbags-local http://localhost:3093/api/mcp --header "Authorization: Bearer nbk_..."
```

| # | Do | Pass |
|---|---|---|
| 1.1 | Ask the agent for a bag with no sources | `create_bag` is refused, naming each stock: "Add a source for …" |
| 1.2 | Ask for a bag with 6 sources on one stock, or one `http://` link | Refused |
| 1.3 | Ask for a proper bag with 1–2 sources per stock | Created. The bag page lists the sources under each stock. `get_bag` returns them. |
| 1.4 | `edit_bag`: replace one stock's sources | Edit history shows `sources:<ID>` |
| 1.5 | `edit_bag`: set one stock's sources to none | Refused |
| 1.6 | `preview_bag` with HOOD and a meme coin, from a blocked country | `cantMeet` lists not tradable, stocks mixed with memes, and the country limit. The agent passes each one on. |
| 1.7 | Build a bag on the website with no sources | Allowed |

### 2. Builder check (no money)

| # | Do | Pass |
|---|---|---|
| 2.1 | Open the builder and add HOOD | "Paused" chip, with a note saying buys are paused |
| 2.2 | Add SLV | Chip saying sells are paused |
| 2.3 | Change weights and the creator fee | The minimum buy updates live and matches what the bag page shows after creating |
| 2.4 | Add cash (USDC) | Allowed. Counts toward 100%. |
| 2.5 | Phone width (375px) | Chips and note don't overflow |

### 3. Treasury (money)

| # | Who | Do | Pass |
|---|---|---|---|
| 3.1 | A | Create a plain bag with nothing paused, e.g. BTC 50 / ETH 50 with a 1% creator fee. Self-buy $20. | Bag goes live. Position created. |
| 3.2 | A | Portfolio → that bag → add the wallet as recovery key | Done. Claude checks the key on chain. |
| 3.3 | A | Profile → Treasury: pick that bag and turn on "send my fees here" | Saved. `/c/<A>` shows the treasury chip. `/t/<A>` opens. |
| 3.4 | A | Try a bag with no recovery key | Refused with the recovery-key message |
| 3.5 | — | Open `/t/<A>` signed out | Holdings, largest share and the ledger show. The cash check shows `$0.00` expected vs actual. |

The fee that lands in the treasury comes from B's gift in step 4.1.

### 4. Gifts (money)

**Gift 1: B gives A's bag, and C claims it.** This also tests the treasury fee.

| # | Who | Do | Pass |
|---|---|---|---|
| 4.1 | B | On A's bag, "Buy it as a gift": $20, a message, expiry 7 days. Pay. | Order completes. The gift shows **ready**. The link box appears. |
| 4.2 | — | Claude checks the money | The gift account holds the bag. A's treasury received exactly 1% of the USDC that arrived. `/t/<A>` lists the fee, and its cash check still matches. |
| 4.3 | B | Portfolio → Gifts sent → copy link | Same link as 4.1 |
| 4.4 | — | Open the link in a private window, signed out | Bag, sender and message show. The amount doesn't. "Treat the link like cash" shows. |
| 4.5 | B | Open the link signed in as B | "This is your own gift" |
| 4.6 | C | Open the link signed in as C, then claim | One wallet or key signature, then success. The gift shows **claimed**. |
| 4.7 | — | Claude checks the money | The gift account is empty. C's new position for the bag holds all of it. |
| 4.8 | B | Open the link again, or press take back | Refused: already claimed |

**Gift 2: B gives any bag, then takes it back.**

| # | Who | Do | Pass |
|---|---|---|---|
| 4.9 | B | Buy a $20 gift of a second bag with nothing paused | Ready |
| 4.10 | B | Open a second browser profile. Sign in as B. Portfolio → Gifts sent. | "Copy link" isn't offered because this device doesn't have the key. "Take back" is. |
| 4.11 | B | Take back, signing with wallet B | The gift shows **reclaimed**. The money is in B's own position for that bag. |
| 4.12 | A | Open gift 2's link (from the first profile) and claim | Refused: the sender took it back |

### 5. Agent trading (money)

Use a fresh agent key for A, called "trade test".

| # | Who | Do | Pass |
|---|---|---|---|
| 5.1 | Script | `trading_status` with trading off | Says trading is off |
| 5.2 | A | Profile → Agent keys → Trading: on, $25 a day, only A's test bag | Saved |
| 5.3 | Script | `buy` a different bag | Refused: not allowed |
| 5.4 | Script | `open_account` on A's bag. Sign the recovery intent. | Account registered. Claude checks wallet A's key is on it. |
| 5.5 | Script | `buy` $30 | Refused: over the daily limit |
| 5.6 | Script, then you | `buy` $20. Send the deposit from B on Arbitrum. | Deposit address and amount shown |
| 5.7 | Script | `order_next`, then `order_sign`, until it says done | The order completes. The portfolio shows the position as "via trade test", read-only. |
| 5.8 | Script | `buy` $10 | Refused: $5 left |
| 5.9 | Script | `sell` 100% with a payout token on Arbitrum | Refused: wallet A is on NEAR |
| 5.10 | Script | `sell` 100%, paid out as USDC on NEAR | Done. The USDC arrives in wallet A's own account, nowhere else. |
| 5.11 | A | Turn trading off. Run `trading_status`, then try a buy. | Off. Refused. |

### 6. Cleanup

1. **C** sells gift 1's position.
2. **B** sells gift 2's position.
3. **A** turns off the treasury and sells the treasury position.
   - It lives only in the local database.
   - On production, A sets up a new treasury from a production position.
4. Claude checks that every account used holds 0, apart from dust under $0.01.
5. Update `FUNDS.md` and write down the order ids.

---

## Round 2: production, after each deploy

Precondition: you've run migrations 0007–0010 on Neon before the first deploy.

| Feature | Check | Money |
|---|---|---|
| Sources | Steps 1.1, 1.3 and 1.6 against `https://nearbags.com/api/mcp` | None |
| Builder | Steps 2.1 and 2.3 | None |
| Treasury | Steps 3.2–3.5 on an existing position of A's | None |
| Gifts | Steps 4.1–4.7: B gifts A's bag and C claims it. This also routes one real fee into the production treasury. | $20 |
| Agent trading | Steps 5.4, 5.6, 5.7 and 5.10, at $20 | $20 |

On every ship day, also:

- check that an ordinary buy and an ordinary sell still work;
- check that old bags, positions and the portfolio look unchanged.

## Not covered

- Gift expiry with real money. The shortest expiry is 7 days, and the expiry refusals are unit-tested.
- Gifts of agent bags. The opt-in at claim was only tested locally without money.
- A claim that merges into a position the recipient already holds. It's the same transfer to the same account, but it hasn't moved real money.

---

## Results

**2026-11-16, Round 1 setup and free checks (Claude):**

- **Setup:**
  - Servers restarted; 3091 and 3092 stopped.
  - Leftover test data cleared. Positions 5 and 7 were checked empty on chain before deleting.
  - `scratchpad/agent-trade.mjs` written and smoke-tested.
- **Sources:** 1.1–1.5 and 1.7 pass. 1.6 failed, then passed after the fix in `f116d3c`. Problems found:
  - six sources were refused with the wrong reason;
  - refusals named "asset 1" instead of the ticker;
  - `preview_bag` hid every problem after the first.
- **Builder:** 2.1–2.5 pass.
  - On a cold server, the "paused" chips appear a few seconds after the page loads.
  - SLV was no longer paused, so 2.2 used GLD.
- **Still to do:** step 0.4 (you sign in with A, B and C), then steps 3–6.
