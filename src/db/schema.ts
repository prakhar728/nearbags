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
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("users_wallet_uq").on(t.walletChain, t.walletAddress), uniqueIndex("users_handle_uq").on(t.handle)],
);

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
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("positions_account_uq").on(t.accountId), uniqueIndex("positions_user_basket_uq").on(t.userId, t.basketId)],
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
  (t) => [index("legs_order_idx").on(t.orderId)],
);

export const feeEvents = pgTable("fee_events", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  recipientKind: text("recipient_kind", { enum: ["creator", "platform"] }).notNull(),
  recipientAccount: text("recipient_account").notNull(),
  asset: text("asset").notNull(),
  amount: text("amount").notNull(),
  txHash: text("tx_hash"),
  status: text("status", { enum: ["pending", "success", "failed"] }).notNull().default("pending"),
  createdAt: createdAt(),
});

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
