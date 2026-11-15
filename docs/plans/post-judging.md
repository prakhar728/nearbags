# Post-judging plan (written 2026-11-15, decisions settled the same day)

Four features taken from Base's "Stocks Maxxing" idea list. We stay on NEAR and don't enter Base's competition.

- **Nothing is pushed until results are out (2026-11-18 23:59 UTC).** That includes feature 1 and any tags.
- All features are built locally now, then tested for real and shipped one per day after that.

## How we work

- **Branches**
  - The integration branch is `next`, in the worktree `../stonkbag-next`, branched from main at `a16eaca`.
  - Each feature gets its own branch off `next` and merges back into `next` when it's done.
  - main stays untouched until merge day. `hackathon-submission` (a local tag at `a16eaca`) marks the code judges saw. It gets pushed and turned into a GitHub release after the 18th.
- **Database**
  - Use local Postgres only (`.env.local`).
  - Migrations number from `0007`, one per feature.
  - The user runs the migrations on production.
- **Real-money tests on mainnet**
  - The user runs them, with small amounts.
  - The user signs every transaction and starts every buy, sell and agent run.
- **Merge day**
  1. Rebase `next` on main.
  2. Run the tests, `next typegen` and `tsc`.
  3. The user runs the migrations on production.
  4. The user says "push".
  5. Ship one feature per day.

## Order

| # | Feature | Size | When |
|---|---|---|---|
| 1 | Sourced proposals (Base 2.2, first half) | Small | Built (`feat/sources`) |
| 2 | Gift a bag, v1 (Base 1.4) | Medium | Built (`feat/gifts`) |
| 3 | Public treasury bag (Base 1.2) | Medium | Built (`feat/treasury`) |
| 4 | Builder check (Base 3.1) | Small | Built (`feat/builder`) |
| 5 | Agents that buy and sell (Base 2.2, second half) | Large | Built (`feat/agent-trading`) |
| 6 | Gifts v2, with dates enforced by the TEE | Medium | Once gifts v1 is in use |

---

## 1. Sourced proposals

**Sources**
- A source is three things: a claim, a title and an `https` link.
  - Example: claim "NVIDIA has ~80% of the AI chip market", title "Reuters, Oct 2026", plus the link.
- Bags created through the MCP `create_bag` must have at least one source for every stock, and at most 5.
  - Otherwise the call is refused, naming the stock: "Add a source for AAPL".
- Bags made on the website keep sources optional. The website builder doesn't change yet.
- Bags that already exist aren't affected.
- Sources are stored in a new column, `basket_assets.sources` (jsonb). Migration `0007_asset_sources`.
- Links must be `https` and are shown as plain links. We don't fetch them or check what they say.

**Editing**
- `edit_bag` can add or replace a stock's sources.
- Each change shows in the public edit history.
- A bag created through the MCP must always keep at least one source for each stock.

**Display**
- The bag page and `get_bag` show the sources under each stock's "why", only when a bag has them.

**Refusals**
- `preview_bag` accepts sources as optional and returns a `cantMeet` list that the agent must pass on to the person. Reasons include:
  - not listed;
  - not tradable now (from `availability.ts`);
  - over the max weight;
  - stocks mixed with meme coins;
  - stocks blocked in the person's country.
- The MCP instructions tell agents to:
  - separate facts with sources from their own opinions;
  - never quietly drop a constraint.

## 2. Gift a bag, v1

**Who and what**
- The recipient must already have a NEAR or EVM wallet. Onboarding people without a wallet is a separate project.
- AI-agent bags can be gifted. While the gift is unclaimed, the agent doesn't rebalance it. On claim, the recipient is asked to let the agent manage it, like any buyer.

**Flow**
1. The sender buys a bag as a gift, with a message and an expiry: 30 days by default, adjustable from 7 to 90.
2. The sender shares the link.
3. The recipient signs in and passes `eligibility()`.
4. The recipient claims, and the bag moves into their own position for that bag. If they already hold the bag, it adds to that position.
5. There's no unlock date in v1. Unlock dates come with v2.

**Accounts**
- The gift is a position of the sender's, with a random key (`randomBasketKey`). The sender's wallet is added as recovery key.
- Until the gift is claimed, it belongs to the sender. The normal sell and withdraw flow takes it back.
- After expiry, claiming stops and the gift stays with the sender.
- The sender's browser keeps the gift key, so the link can be copied again on that device. On another device, the sender can only take the gift back.

**The link and claiming**
- The link is `nearbags.com/g/<id>#<gift secret>`. Because the secret sits after the `#`, it never reaches our server.
- On claim, the gift key signs one `transfer` of every balance to the claimer's own account for that bag. `/api/relay/gift` relays it and allows only:
  - a signer that is that gift's account;
  - a receiver that is the claimer's own account for the same bag;
  - the account's full balances;
  - a claim before expiry;
  - a claimer who passes `eligibility()`.
- The page warns: "Treat the link like cash. Anyone with it can take the gift." Our relay enforces expiry, but someone holding the link could still go to `intents.near` directly.

**The gift page**
- `/g/[id]` shows the bag, the sender's name and the message.
- The amount stays hidden until the recipient signs in.
- The page also gets a share image.

**Database**
- Migration `0008_gifts` adds a `gifts` table:
  - `id`, `sender_user_id`, `position_id`, `basket_id`, `message`, `expires_at`;
  - `status`: `funding`, `ready`, `claimed`, `reclaimed` or `expired`;
  - `claimed_by_user_id`, `claim_tx`, `created_at`.
- The `(user_id, basket_id)` unique index on positions becomes partial, so it ignores gift positions and agent positions (feature 5 needs that too).

**Tests**
- Unit tests for the relay allowlist and for the status changes.
- One real gift between two of the user's own wallets, at the bag's minimum size.

## 3. Public treasury bag

- **One per creator.** At first it's funded only by the creator's own nearbags fees.
  - Fees are already USDC `transfer` intents to `creatorFeeAccount(creator)` (`src/lib/trade/orders.ts:192`).
  - So only the receiving account changes, and `fee_events` gives an exact ledger.
  - Outside deposits (such as a Nearly coin's fees) come later.
- **Its page `/t/[slug]` shows:**
  - each fee received and each purchase;
  - who can spend;
  - holdings and the share held in the largest asset;
  - "received − spent − costs = cash left".
- **Purchases:** a new "buy from balance" order uses the USDC already in the account.
  - The owner approves each purchase.
  - Automatic buying by the agent comes after feature 5.
- **Database:** migration `0009_treasury`.
- **Tests:** a unit test for the reconciliation, plus one real fee routed by the user.

## 4. Builder check

USDC as cash and the trade availability check (`src/lib/trade/availability.ts`) already exist. Only fix what's missing:
- show "not tradable right now" in the builder;
- a clear "Add cash" option;
- a minimum buy that updates live.

## 5. Agents that buy and sell

**What an agent can do**
- Buy and sell only. Sale money goes only to the owner's sign-in wallet.
- Agents never withdraw to an address they choose.

**Positions**
- Each bag an agent buys gets its own position account, separate from the owner's own position.
- The portfolio shows it as "via <key name>".
- The owner's wallet is added as recovery key before the agent's first buy.

**Keys and payment**
- The agent creates and holds its own key. nearbags never sees it.
- The agent pays from its own wallet, through the normal 1Click deposit address.
- Signing uses a code sample in the docs. There's no published npm package for now.

**MCP tools**
- `buy_prepare` / `buy_submit` and `sell_prepare` / `sell_submit`, for agent keys only.
- They're marked destructive, so agent clients ask the person first.
- Every trade is audit-logged with the key's name.

**Limits for each key**
- Trading is off by default.
- When it's on, the default limit is $100 a day, and the profile can raise it to at most $1,000 a day.
- The owner chooses which bags the agent may trade.

**Tests**
- A full buy and sell at the minimum size, started by the user with their own key and their own money.

## 6. Gifts v2

The OutLayer TEE holds the gift key, and its code enforces:
- the unlock date;
- expiry, with the gift returned to the sender;
- the eligibility check.

The link carries only a claim code. The gift page shows the attestation proof.

## Status (2026-11-15)

Features 1 to 5 are built on `next` and checked locally (unit tests plus local end-to-end calls). None has run with real money yet. Migrations run in order on production: 0007 sources, 0008 treasury, 0009 gifts, 0010 agent trading.

Still to test for real, by the user with small amounts:
- A gift between two of the user's wallets: buy, claim, and take back.
- One fee routed into a treasury.
- An agent key's full buy and sell.
