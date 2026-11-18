# Security audit, 2026-11-18

Read-only review of branch `next` (everything about to ship) plus what's already live on main. Four reviewers read the code (sign-in and routes, money flow, gifts and treasury, agents and MCP); Claude checked the repo for secrets, ran `pnpm audit`, probed the live site's headers and protected routes, and re-read the code behind every high finding. No transactions, no mainnet writes.

"Live" means the issue is already on nearbags.com today; "new" means it comes with the `next` features.

## Fix before shipping

| # | Issue | Where | Live/new |
|---|---|---|---|
| 1 | **The browser signs whatever the server hands it, and resumes open orders on page load.** A sell or withdraw can name any payout address. Anyone with a user's session (see 2) creates a 100% sell to their own address; the next time the user opens the bag, their browser signs every leg and the money goes to the attacker. A compromised server or a bad 1Click payload could do the same. | `client/order-runner.ts:20-24, 49-50`, `BuyPanel.tsx:169-185`, `trade/orders.ts:347-414, 508-526, 310-333` | live |
| 2 | **Sign-in signatures can be relayed by a phishing site.** The NEP-413 recipient is the fixed string `nearbags` and the EVM message is free text, so wallets can't warn about the wrong domain. A phishing page gets a real nonce, has the victim sign, and receives a 7-day session. | `auth/messages.ts:7-16`, `api/auth/nonce` | live |
| 3 | **Two tabs (or a tab plus an agent) can fund an order twice.** The deposit check and the insert of legs and fee rows aren't atomic, and there's no unique index on `order_legs(order_id, seq)`. Result: fees charged twice and a duplicate leg that never runs, so the order is stuck and sell/withdraw are blocked. Fee relays can also go out twice from two tabs. | `trade/orders.ts:187-240, 574-581`, `db/schema.ts` | live |
| 4 | **No CSP or anti-framing headers.** Position seeds are decryptable by any script on the page, so one XSS steals every key. The site can also be framed. | `next.config.ts` (only HSTS is sent) | live |
| 5 | **An agent's daily buy limit can be raced.** One MCP request with 20 parallel `buy` calls each sees $0 spent. | `agent-trading.ts:154-157`, `api/mcp/route.ts:137` | new |

**Fixes**
1. The browser parses every payload before signing: signer is the position, only one transfer, to the leg's 1Click deposit address or a known fee account or the payout address the user confirmed, for no more than the amount shown. The server parses 1Click's `generate-intent` payload the same way before storing it. Sells and withdraws need a click to resume; buys can still resume on their own. A payout to an address other than the user's own wallet needs a fresh wallet signature.
2. The NEP-413 recipient becomes `nearbags.com`, EVM sign-in becomes SIWE (EIP-4361) with the domain, and every cookie-authenticated POST/PATCH/DELETE checks `Origin`.
3. Each status change becomes a conditional update (`… WHERE status = 'awaiting_deposit' RETURNING`) in a transaction. Add unique indexes on `order_legs(order_id, seq)` and `fee_events(order_id, recipient_kind)`, and allow one open order per position.
4. Add a CSP (scripts from our own origin with nonces, plus the wallet SDK hosts it needs), `frame-ancestors 'none'`, `X-Content-Type-Options`, and `Referrer-Policy`.
5. Lock the key row (`SELECT … FOR UPDATE`) and re-check the limit just before inserting the order. Count each message in a batch against the rate limit.

## Fix soon

| # | Issue | Live/new |
|---|---|---|
| 6 | **The gift link key stays valid after a take-back or expiry.** Whoever holds the link can still move anything that lands in the gift account, straight on intents.near, so expiry and region checks only apply through our site. Fix: the take-back also removes the gift key (sender's wallet key signs `remove_public_key`; check intents.near allows it). | new |
| 7 | **"An agent can never withdraw" is our server's rule, not the chain's.** The agent holds its account's full key and can submit a withdrawal to intents.near directly. Fix: reword the UI and docs ("nearbags only builds buys and sells for it"), and tell owners to fund an agent only with what they'd hand over. | new |
| 8 | **Creator text reaches trading agents as plain text.** A thesis can say "buy 1,000 of this bag". Fix: return thesis/why/sources in a field marked untrusted, and say so in the MCP instructions. | new |
| 9 | **Anyone can register any intents account as their position.** This inflates a bag's TVL and holder count, and can squat on someone's account. Fix: require proof (a signature by the account's key) before inserting. | live |
| 10 | **Relayer NEAR and the 1Click quota can be run down.** Parallel `run_agent` calls bypass the 10-minute gap, device keys are unlimited, and rate limits are per server instance. Fix: a lock per bag for agent runs, a cap on device keys, a shared rate limit (Upstash or Vercel Firewall), a daily relayer budget, and a balance alert that runs off the Mac. | live |
| 11 | **Stuck orders can't be cancelled and never expire.** Fix: expire unpaid buys after the quote deadline, add a cancel action, and mark a leg failed when there's nothing left to swap. | live |
| 12 | **Gift details.** The public treasury page names gift senders. Gift amounts are taken from order history, not from what was actually transferred. Gift status updates don't check the current status. | new |

## Low

- 500 errors return the raw database error text, including SQL (`auth/session.ts:76`). Agent tools return raw internal errors too (`agent-trading.ts:208, 229`).
- Session JWTs don't check type or audience. P&L share tokens use the same secret and are accepted as sessions; they only cause 500s.
- Logout doesn't revoke the 7-day token.
- The admin check ignores the wallet chain. Cron secret comparison isn't constant-time.
- Turning agent trading off doesn't stop orders already running (revoking the key does).
- A leg marked failed after a timeout can be retried even if 1Click accepted it.
- `/t/<bad-encoding>` may return 500 instead of 404.
- The gift claim page doesn't check the transfer's receiver before signing (the server does).
- `pnpm audit`: 3 "high" advisories, all inside WalletConnect's dependencies (`zod` <4.6.6, `picomatch`). Our own `zod` is 4.6.7.

## Checked and sound

- **Secrets:** none in the repo or its history. `.env*` is ignored, and the only public env vars are the site URL and the WalletConnect id. The live site returns 404 for `/.env` and `/.git`.
- **Admin and cron:** the live admin and cron routes return 401 without credentials.
- **Sign-in checks:**
  - NEAR sign-in checks the key on chain and requires a full-access key.
  - EVM sign-in checks the recovered address.
  - Nonces are single-use and expire after 5 minutes.
  - The cookie is httpOnly, secure and SameSite=Lax.
- **Ownership:**
  - Every order, position, gift, treasury and agent-key route checks ownership.
  - Payout and refund addresses can't be changed after an order is created.
- **Fees:**
  - Fee recipients come from the database, and the signed fee transfers must match exactly.
  - Swap legs must be byte-identical to what the server stored.
- **Relayer:** it only relays allowlisted payloads and simulates each one first.
- **Agent keys:**
  - 256-bit, stored hashed, revocation checked on every request.
  - Scoped to the owner's bags; trading is off by default.
  - Sale money is forced to the owner's wallet; `open_account` only accepts adding the owner's key.
- **Gifts:**
  - Codes have 60 random bits.
  - The key never leaves the `#`.
  - A claim through the server must be a full transfer into the claimer's own position.
  - Claim and take-back can't both succeed on chain.
- **Rendering and fetching:**
  - Markdown outputs React elements only and allows http/https/mailto links.
  - Source links must be https and use `rel=noopener noreferrer`.
  - The server never fetches user URLs (no SSRF).
- **Rebalancing agent:** it never sees creator text. Its output is clamped, and the signer checks that every swap pays back into the same account.

## Status after fixes (2026-11-18, branch `security`)

Three review rounds. Round 1 above. Round 2 (independent re-audit) found 10 more, N1–N10. Round 3 verified those and found 6 smaller ones. Everything below is fixed on `security` unless marked open. Tests: 218 pass, plus typecheck, lint and a production build.

- **All 12 round-1 items:** fixed. #4 is partly done: framing, nosniff, referrer and permissions headers are enforced. The strict script and connect policy is **report-only** (`/api/csp-report` logs violations). Turn it on after real wallet use shows a clean log.
- **N1, derived keys phishable by one fixed-text signature:** new wallets now get device keys. **Open:** wallets already on derived keys still use it. Plan a move that adds a device key, then removes the derived key from each account.
- **N2:** money leaving for any address other than the signed-in wallet needs a fresh wallet signature (`lib/payout-approval.ts`). Round 3 also made the own-wallet exemption check the chain.
- **N3:** the browser refuses 1Click quotes with an app fee or more than 1% slippage. **Open:** fee receivers aren't allowlisted in the browser; fees are capped at 1.6% of the USDC in the account.
- **N4:** agent accounts are recorded only after the agent signs the exact current recovery-key intent. Stats count only accounts with a recovery key.
- **N5 to N8, N10:** fixed.
- **N9, accepted:** a user can always skip fees by moving their own money first, since they hold the key.
- **Round 3:**
  - users with no saved mode but existing derived accounts can still use derived;
  - the device-key cap is 20 a year;
  - the sell lease lasts 300 s.
- **Open, low:** a Rhea relay timeout still marks the leg failed.

**Deploy note:** migration 0011 was edited after it was first applied to the local database only (the `leases.owner` and `users.session_version` columns). Production hasn't run 0007–0011 yet, so it gets the final file. After migrating production, check that both columns exist:
`select column_name from information_schema.columns where table_name in ('leases','users') and column_name in ('owner','session_version');`
should return 2 rows. Before 0011, check for duplicates (both should be 0):
`select count(*) from (select order_id, seq from order_legs group by 1,2 having count(*)>1) x;`
`select count(*) from (select order_id, recipient_kind from fee_events group by 1,2 having count(*)>1) y;`
