# Round 1 runbook: the money tests, click by click

All on `http://localhost:3093` (local database, mainnet money). After each **Tell Claude**, stop and wait. Claude checks the chain and the database before you go on.

**Wallets**
- **A** = `testing69.near`
- **B** = `0x91BdF26D…A4a6` (EVM, pays with USDC on Arbitrum)
- **C** = `chillguyy.near`

**One bag for everything:** A's new BTC 50 / ETH 50 bag with a 1% creator fee. Crypto trades all week and nothing in it is paused.

**Money:** about $100 of USDC moves through these tests:
- B pays $40 for two gifts;
- A pays $20 for the self-buy;
- B pays $20 to fund the agent, $20 + a little for fees.

Almost all of it comes back. Fees and slippage should come to under $2.

**Token ids:**
- USDC on Arbitrum: `nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near`
- USDC on NEAR: `nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1`

---

## Step 0: sign in (2 minutes, no money)

1. Sign in with A, then sign out. Sign in with B, then sign out. Sign in with C, then sign out.
2. **Tell Claude** "signed in". Claude checks that all three wallet keys are stored.

## Step 1: A's bag becomes the treasury ($20)

1. As **A**: Create → BTC 50 / ETH 50 → Thesis (anything) → Fee **1%** → Publish.
2. On the bag page, buy **$20**. Your wallet asks you to:
   - add the recovery key;
   - pay.
3. Wait for "done".
4. Profile → **Treasury** → pick this bag → tick "Send the fees my bags earn into this treasury instead of my wallet" → **Save**.
5. **Tell Claude** the bag's slug.

**Claude checks:**
- the bag is live;
- A's wallet key is on the bag's account;
- the treasury row has fees routed;
- `/t/testing69.near` loads and its cash check matches;
- `/c/testing69.near` shows the treasury chip.

## Step 2: gift 1, from B to C ($20)

1. As **B**: open A's bag → tick **Buy it as a gift** → Message "test gift 1" → Claim within **7** days → **Gift it**. Pay **$20** in USDC on Arbitrum.
2. When it's done, **Copy link**. **Paste the link only into the browser.** Don't paste it here: it's like cash.
3. **Tell Claude** "gift 1 paid".

**Claude checks:**
- the gift is ready and its account holds BTC and ETH;
- 1% of the USDC that arrived went to A's treasury account;
- `/t/testing69.near` lists that fee and its cash check still matches.

4. Open the link in a private window, signed out. You should see the bag, "B" as sender and the message, and **no amount**.
5. Open the link signed in as **B**. You should see "This is your own gift".
6. Sign out, sign in as **C**, open the link → **Claim your gift** → sign once.
7. **Tell Claude** "gift 1 claimed".

**Claude checks:**
- the gift account is empty;
- C's position holds everything that was in it;
- the gift's status is claimed.

8. As **B**: Portfolio → Gifts you sent. Gift 1 shows "Claimed" and has no **Take back** button.

## Step 3: gift 2, B takes it back ($20)

1. As **B**: buy A's bag as a gift again, **$20**, message "test gift 2".
2. **Tell Claude** "gift 2 paid". Claude checks it's ready, and that a second fee landed in the treasury.
3. Optional, if you have a second browser with B's wallet: there, Portfolio → Gifts you sent shows **Take back** but no **Copy link**.
4. Copy gift 2's link first: Portfolio → Gifts you sent → **Copy link**. Keep it for step 7.
5. **Take back** → sign with B's wallet.
6. **Tell Claude** "gift 2 back". Claude checks:
   - the gift account is empty;
   - B's own position for the bag holds it;
   - the status is reclaimed.
7. As **C**, open gift 2's link. It should say "The sender took this gift back."

## Step 4: agent trading ($20)

**You:**
1. As **A**: Profile → Agent keys → name it **trade test** → **New key** → **Copy**.
2. Save the key in this file, and don't paste it here:

   `/private/tmp/claude-501/-Users-prakharojha-Desktop-me-personal-trading/88819edb-baf3-4f22-9c5f-2b07357719ac/scratchpad/trade-test-key.txt`

In a terminal: `cd` to that scratchpad folder and set `T="node agent-trade.mjs"`. The script uses its own fresh key, which only it holds.

| # | Run | Expect |
|---|---|---|
| 4.1 | `$T status` | trading off |
| 4.2 | As A: Agent keys → trade test → **Trading** → tick "Let this key buy and sell…" → daily **25** → tick only A's test bag → **Save** | Saved |
| 4.3 | `$T buy big-tech-vs-bitcoin 20 <USDC arb id> 0x91Bd…` | refused: this key isn't allowed to trade that bag |
| 4.4 | `$T open <A's slug>` | prints the one intent it signs (adding A's wallet key), then `ready: true` |
| 4.5 | `$T buy <A's slug> 30 <USDC arb id> 0x91BdF26DAe85b78D41c36C064012fCf3e732A4a6` | refused: over the daily limit, $25 left |
| 4.6 | `$T buy <A's slug> 20 <USDC arb id> 0x91BdF26DAe85b78D41c36C064012fCf3e732A4a6` | prints `pay`: an address and an exact amount |

**Then:**
1. From **B's** wallet, send **exactly** that amount of USDC on Arbitrum to that address.
2. Run `$T run <order id>`. It signs the fee transfers and the swaps, printing each one, until it says done.
3. **Tell Claude** the order id.

**Claude checks:**
- the agent account holds BTC and ETH;
- the order is complete;
- A's portfolio shows the bag "via trade test", read-only.

| # | Run | Expect |
|---|---|---|
| 4.7 | `$T buy <A's slug> 10 …` | refused: $5 left |
| 4.8 | `$T sell <A's slug> 100 <USDC arb id>` | refused: pick a payout token on NEAR |
| 4.9 | `$T sell <A's slug> 100 <USDC NEAR id>`, then `$T run <sell order id>` | done |

4. **Tell Claude** "agent sold". Claude checks that:
   - the agent account is empty;
   - the USDC reached `testing69.near`;
   - it went nowhere else.
5. As A: Trading → untick → **Save**. Then `$T status` should say off, and `$T buy …` should be refused.

## Step 5: cleanup

1. As **C**: sell 100% of A's bag. Payout USDC to `chillguyy.near`.
2. As **B**: sell 100% of A's bag. Payout USDC on Arbitrum.
3. As **A**: Treasury → **No treasury** → Save. Then sell 100% of the bag.
4. **Tell Claude** "cleaned up".

**Claude:**
- checks that every account used holds nothing but dust;
- records the order ids in `test-plan.md`;
- updates `FUNDS.md`.

---

## If something goes wrong

- **A step fails or hangs:** stop and tell Claude the order id. Don't retry. Claude finds where the money is first.
- **"Quoting not available" or a 1Click 500:** 1Click is having trouble, not our code. Wait 10 minutes and try again.
- **A deposit was sent but the order shows "awaiting deposit" for over 10 minutes:** tell Claude. 1Click refunds to B's address if a swap fails.
- **Money stuck in any account:** every account has your wallet's key on it, so it can always be recovered by hand.
