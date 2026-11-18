// Database schema (spec §6). Holdings are NOT stored here: intents.near is the source of truth for balances.
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    walletChain: text("wallet_chain", { enum: ["near", "evm"] }).notNull(),
    walletAddress: text("wallet_address").notNull(),
    walletPubkey: text("wallet_pubkey"), // "ed25519:..." or "secp256k1:..." as intents.near expects
    keyMode: text("key_mode", { enum: ["derived", "device"] }),
    handle: text("handle"),
    bio: text("bio"),
    xUrl: text("x_url"),
    isAdmin: boolean("is_admin").notNull().default(false),
    acceptedRiskAt: timestamp("accepted_risk_at", { withTimezone: true }),
    attestations: jsonb("attestations").$type<Partial<Record<"risk" | "not_us_person" | "professional", string>>>().notNull().default({}),
    // Bumped on logout: sessions issued under an older version stop working on routes that move money or change data.
    sessionVersion: integer("session_version").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("users_wallet_uq").on(t.walletChain, t.walletAddress), uniqueIndex("users_handle_uq").on(t.handle)],
);

/** A link that backs a claim about an asset in a basket. */
export interface Source {
  claim: string;
  title: string;
  url: string;
}

export interface AgentConfig {
  /** The creator's private prompt for the AI. Empty when the basket uses a template. */
  strategy: string;
  limits: { minWeightBps: number; maxWeightBps: number; maxChangeBps: number; maxTurnoverBps: number };
  /** A rule-based strategy instead of the AI (public). baseBps: the creator's starting weights. */
  template?: { id: "fixed" | "equal" | "risk" | "trend" | "voltarget" | "momentum"; baseBps: Record<string, number> } | null;
}

export const baskets = pgTable(
  "baskets",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull(),
    creatorId: integer("creator_id").notNull().references(() => users.id),
    name: text("name").notNull(),
    tagline: text("tagline").notNull(),
    thesis: text("thesis").notNull(),
    risks: text("risks").notNull(),
    horizon: text("horizon", { enum: ["3m", "1y", "3y+"] }).notNull(),
    exitSignal: text("exit_signal"),
    deepDive: text("deep_dive"),
    feeBps: integer("fee_bps").notNull(),
    isHouse: boolean("is_house").notNull().default(false),
    status: text("status", { enum: ["draft", "pending", "live", "closed", "hidden"] }).notNull().default("draft"),
    hiddenReason: text("hidden_reason"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    // Agent-managed baskets: the creator's strategy (private, never sent to other users) and the weight limits the
    // agent must stay inside. Null for ordinary baskets.
    agent: jsonb("agent").$type<AgentConfig>(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("baskets_slug_uq").on(t.slug), index("baskets_status_idx").on(t.status)],
);

export const basketAssets = pgTable(
  "basket_assets",
  {
    basketId: integer("basket_id").notNull().references(() => baskets.id, { onDelete: "cascade" }),
    assetId: text("asset_id").notNull(),
    weightBps: integer("weight_bps").notNull(),
    why: text("why").notNull(),
    // Links backing the why (claim, title, https url). Required for bags made by agents, optional on the site.
    sources: jsonb("sources").$type<Source[]>(),
  },
  (t) => [primaryKey({ columns: [t.basketId, t.assetId] })],
);

export const basketEdits = pgTable("basket_edits", {
  id: serial("id").primaryKey(),
  basketId: integer("basket_id").notNull().references(() => baskets.id, { onDelete: "cascade" }),
  field: text("field").notNull(),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  editedAt: timestamp("edited_at", { withTimezone: true }).notNull().defaultNow(),
});

export const positions = pgTable(
  "positions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id),
    basketId: integer("basket_id").notNull().references(() => baskets.id),
    accountId: text("account_id").notNull(), // hex implicit account in intents.near
    keyMode: text("key_mode", { enum: ["derived", "device"] }).notNull(),
    recoveryKeyAddedAt: timestamp("recovery_key_added_at", { withTimezone: true }),
    // When the holder added the agent's key to this account (agent-managed baskets), and which key it was.
    agentKeyAddedAt: timestamp("agent_key_added_at", { withTimezone: true }),
    agentPublicKey: text("agent_public_key"),
    // "own": the user's own holding (one per user and basket). "gift": a bag they bought for someone else; it stays
    // theirs until claimed (see gifts). "agent": bought by one of the user's agent keys, on an account whose key the
    // agent holds; the user's wallet is its recovery key. Gift and agent accounts never count as the user's own holding.
    kind: text("kind", { enum: ["own", "gift", "agent"] }).notNull().default("own"),
    agentKeyId: integer("agent_key_id").references(() => agentKeys.id),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("positions_account_uq").on(t.accountId),
    uniqueIndex("positions_user_basket_uq").on(t.userId, t.basketId).where(sql`${t.kind} = 'own'`),
    uniqueIndex("positions_agent_basket_uq").on(t.agentKeyId, t.basketId).where(sql`${t.kind} = 'agent'`),
  ],
);

export const ORDER_STATUSES = [
  "preflight",
  "awaiting_deposit",
  "funded",
  "fees_paid",
  "legs_running",
  "complete",
  "partial",
  "failed",
  "refunded",
] as const;

export const orders = pgTable(
  "orders",
  {
    id: serial("id").primaryKey(),
    positionId: integer("position_id").notNull().references(() => positions.id),
    kind: text("kind", { enum: ["buy", "sell", "reset", "withdraw"] }).notNull(),
    status: text("status", { enum: ORDER_STATUSES }).notNull(),
    payAsset: text("pay_asset"), // 1Click asset id paid with (buy) or paid out (sell)
    payAmount: text("pay_amount"), // smallest units
    payoutAddress: text("payout_address"),
    refundAddress: text("refund_address"),
    usdIn: doublePrecision("usd_in"),
    usdOut: doublePrecision("usd_out"),
    sellPct: integer("sell_pct"),
    fundingDepositAddress: text("funding_deposit_address"),
    fundingDepositMemo: text("funding_deposit_memo"),
    fundingQuote: jsonb("funding_quote"),
    grossUsdc: text("gross_usdc"), // buy: USDC that landed in the basket account (smallest units)
    usdcStart: text("usdc_start"), // sell: USDC already in the account that this sell pays out (pct of it)
    error: text("error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("orders_position_idx").on(t.positionId)],
);

export const orderLegs = pgTable(
  "order_legs",
  {
    id: serial("id").primaryKey(),
    orderId: integer("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    assetFrom: text("asset_from").notNull(),
    assetTo: text("asset_to").notNull(),
    amountIn: text("amount_in").notNull(),
    amountOutExpected: text("amount_out_expected"),
    amountOutActual: text("amount_out_actual"),
    depositAddress: text("deposit_address"),
    intentHash: text("intent_hash"),
    payload: text("payload"), // exact intent payload generated for signing; the submitted signature must cover it
    recipient: text("recipient"), // set when the leg delivers outside Intents (payout, withdraw); null = back to the basket account
    attempts: integer("attempts").notNull().default(0),
    status: text("status", { enum: ["pending", "quoted", "submitted", "success", "refunded", "failed"] }).notNull().default("pending"),
    quote: jsonb("quote"),
    guard: jsonb("guard"),
    error: text("error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  // One row per step: two tabs funding the same order at once can't plan its swaps twice (security audit 2026-11-18).
  (t) => [index("legs_order_idx").on(t.orderId), uniqueIndex("legs_order_seq_uq").on(t.orderId, t.seq)],
);

export const feeEvents = pgTable(
  "fee_events",
  {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  recipientKind: text("recipient_kind", { enum: ["creator", "platform"] }).notNull(),
  recipientAccount: text("recipient_account").notNull(),
  asset: text("asset").notNull(),
  amount: text("amount").notNull(),
  txHash: text("tx_hash"),
  status: text("status", { enum: ["pending", "success", "failed"] }).notNull().default("pending"),
  createdAt: createdAt(),
  },
  // One creator fee and one platform fee per order, never two.
  (t) => [uniqueIndex("fees_order_kind_uq").on(t.orderId, t.recipientKind)],
);

export const priceDaily = pgTable(
  "price_daily",
  {
    source: text("source").notNull(),
    ticker: text("ticker").notNull(),
    date: date("date").notNull(),
    close: doublePrecision("close").notNull(),
  },
  (t) => [primaryKey({ columns: [t.source, t.ticker, t.date] })],
);

export const priceMedian = pgTable(
  "price_median",
  {
    ticker: text("ticker").notNull(),
    date: date("date").notNull(),
    close: doublePrecision("close").notNull(),
    sourcesUsed: text("sources_used").array().notNull(),
    flagged: text("flagged").array().notNull().default(sql`'{}'::text[]`),
  },
  (t) => [primaryKey({ columns: [t.ticker, t.date] })],
);

export const dividends = pgTable(
  "dividends",
  {
    source: text("source").notNull(),
    ticker: text("ticker").notNull(),
    exDate: date("ex_date").notNull(),
    amount: doublePrecision("amount").notNull(),
  },
  (t) => [primaryKey({ columns: [t.source, t.ticker, t.exDate] })],
);

export const snapshots = pgTable(
  "snapshots",
  {
    id: serial("id").primaryKey(),
    basketId: integer("basket_id").notNull().references(() => baskets.id),
    takenAt: timestamp("taken_at", { withTimezone: true }).notNull().defaultNow(),
    tvlUsd: doublePrecision("tvl_usd").notNull(),
    holders: integer("holders").notNull(),
    indexValue: doublePrecision("index_value"),
  },
  (t) => [index("snapshots_basket_idx").on(t.basketId, t.takenAt)],
);

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
});

export const auditLog = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  target: text("target"),
  details: jsonb("details"),
  createdAt: createdAt(),
});

// Keys a creator makes on their profile so an AI agent can manage their baskets through the MCP server. Only a
// SHA-256 of the key is stored; the key itself is shown once. Revoked keys stay for the audit trail.
export const agentKeys = pgTable(
  "agent_keys",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id),
    name: text("name").notNull(),
    prefix: text("prefix").notNull(), // first characters of the key, shown so the owner can tell keys apart
    hash: text("hash").notNull(),
    scopes: text("scopes").array().notNull(),
    // Trading (plan feature 5): off until the owner turns it on. Buys count against a daily USD limit; the key may
    // trade only the listed baskets, or any live one. Sells nearbags builds pay the owner's own wallet.
    tradeEnabled: boolean("trade_enabled").notNull().default(false),
    tradeDailyUsd: integer("trade_daily_usd").notNull().default(100),
    tradeAnyBag: boolean("trade_any_bag").notNull().default(false),
    tradeBasketIds: integer("trade_basket_ids").array().notNull().default(sql`'{}'::integer[]`),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("agent_keys_hash_uq").on(t.hash), index("agent_keys_user_idx").on(t.userId)],
);

export const authNonces = pgTable("auth_nonces", {
  nonce: text("nonce").primaryKey(),
  expiresAt: bigint("expires_at", { mode: "number" }).notNull(),
});

// One agent run on one basket: the strategist's decision, then a rebalance of each opted-in holder's account.
export const agentRuns = pgTable(
  "agent_runs",
  {
    id: serial("id").primaryKey(),
    basketId: integer("basket_id").notNull().references(() => baskets.id),
    trigger: text("trigger", { enum: ["cron", "creator", "admin"] }).notNull(),
    status: text("status", { enum: ["deciding", "rebalancing", "done", "failed"] }).notNull().default("deciding"),
    weightsBefore: jsonb("weights_before").$type<Record<string, number>>(),
    weightsAfter: jsonb("weights_after").$type<Record<string, number>>(),
    reason: text("reason"),
    model: text("model"),
    decideTx: text("decide_tx"), // OutLayer request_execution tx: its attestation is at /attestations/by-tx/{tx}
    orders: jsonb("orders").$type<{ positionId: number; orderId: number | null; note?: string }[]>(),
    signTxs: jsonb("sign_txs").$type<string[]>(),
    error: text("error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("agent_runs_basket_idx").on(t.basketId, t.createdAt)],
);

// A creator's public treasury: one of their own positions, shown to anyone at /t/<handle> with every fee received
// and every purchase. When routeFees is on, the creator fees their bags earn go into this account instead of their
// wallet. Only the owner's keys can spend it, as with any position.
export const treasuries = pgTable(
  "treasuries",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id),
    positionId: integer("position_id").notNull().references(() => positions.id),
    routeFees: boolean("route_fees").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("treasuries_user_uq").on(t.userId), uniqueIndex("treasuries_position_uq").on(t.positionId)],
);

// A bag bought as a gift (plan feature 2). The position belongs to the sender until someone claims it: the claim moves
// every balance into the claimer's own position for the same bag. The claim link carries the gift account's key after
// the #, so our server never sees it; expiry is enforced by our relay only (the page says so).
export const gifts = pgTable(
  "gifts",
  {
    id: serial("id").primaryKey(),
    code: text("code").notNull(), // public id in the link: /g/<code>
    senderUserId: integer("sender_user_id").notNull().references(() => users.id),
    positionId: integer("position_id").notNull().references(() => positions.id),
    basketId: integer("basket_id").notNull().references(() => baskets.id),
    message: text("message"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    // cancelled: the sender dropped it before paying (no migration: the column is plain text).
    status: text("status", { enum: ["funding", "ready", "claimed", "reclaimed", "cancelled"] }).notNull().default("funding"),
    claimedByUserId: integer("claimed_by_user_id").references(() => users.id),
    claimTx: text("claim_tx"),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    // The exact tokens the claim or take-back moved ([asset id, raw units]), read from the relayed transfer.
    moved: jsonb("moved").$type<[string, string][]>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("gifts_code_uq").on(t.code), uniqueIndex("gifts_position_uq").on(t.positionId), index("gifts_sender_idx").on(t.senderUserId)],
);

// Request counters shared by every server instance (the in-memory limiter wasn't). One row per key and window.
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  hits: integer("hits").notNull(),
});

// Short leases: "only one of these at a time" across instances without holding a database connection open.
export const leases = pgTable("leases", {
  key: text("key").primaryKey(),
  until: timestamp("until", { withTimezone: true }).notNull(),
  owner: text("owner").notNull().default(""), // random per holder, so a late release can't free someone else's lease
});
