// MCP tools for agent keys that trade (plan feature 5). The agent holds its own ed25519 key and signs locally; these
// tools hand it exact intents or payloads and check what comes back. See docs/agents.md for the signing sample.
import "server-only";
import { z } from "zod";
import * as trading from "@/lib/agent-trading";
import type { SignedRawEd25519 } from "@/lib/intents/payload";
import type { AuthedTool } from "./creator-tools";

const tool = <S extends z.ZodType>(t: AuthedTool<S>) => t as unknown as AuthedTool;

const signedIn = z
  .object({
    standard: z.literal("raw_ed25519"),
    payload: z.string().min(1).max(4000).describe("The exact string you signed"),
    public_key: z.string().min(1).max(100).describe("ed25519:<base58 public key>"),
    signature: z.string().min(1).max(200).describe("ed25519:<base58 signature> over the payload's UTF-8 bytes"),
  })
  .describe("A raw_ed25519 signed payload, as in the nearbags docs sample");

const slug = z.string().min(1).max(80).describe("The bag's slug, from its url /b/<slug>");

export const TRADE_TOOLS: AuthedTool[] = [
  tool({
    name: "trading_status",
    title: "Trading status",
    description: "Whether this key may trade, its daily buy limit and what's left, the bags it may trade, the wallet sale money goes to, and this key's accounts with any open orders.",
    input: z.object({}),
    readOnly: true,
    run: async (_args, a) => trading.myAccounts(a),
  }),

  tool({
    name: "open_account",
    title: "Open an account for a bag",
    description:
      "Register the account you'll trade a bag in. account_id is the 64-character hex of an ed25519 public key you hold (never send the private key). The first call returns one intent to sign: adding the key owner's wallet as recovery key, so they can always take over. Sign it as a raw_ed25519 payload and call again with signed. Needed once per bag.",
    input: z.object({ bag: slug, account_id: z.string().length(64), signed: signedIn.optional() }),
    readOnly: false,
    run: async ({ bag, account_id, signed }, a) => trading.openAccount(a, bag, account_id, signed as SignedRawEd25519 | undefined),
  }),

  tool({
    name: "buy",
    title: "Buy a bag",
    description:
      "Buy a bag into your account for it, paying from your own wallet. Returns where to send the payment (any token 1Click supports, on its own chain). Counts against this key's daily limit. Then call order_next until it says done.",
    input: z.object({
      bag: slug,
      usd: z.number().positive().max(1000),
      pay_asset: z.string().min(3).describe("1Click asset id you'll pay with, e.g. nep141:usdc on its chain (see 1Click's token list)"),
      refund_address: z.string().min(2).max(128).describe("Your address on the pay token's chain, for refunds"),
    }),
    readOnly: false,
    run: async ({ bag, usd, pay_asset, refund_address }, a) => trading.buy(a, { slug: bag, usd, payAssetId: pay_asset, refundAddress: refund_address }),
  }),

  tool({
    name: "sell",
    title: "Sell a bag",
    description:
      "Sell 25, 50, 75 or 100% of your holding in a bag. The money always goes to the key owner's own sign-in wallet, so the payout token must be on that wallet's chain. Then call order_next until it says done. At most 5 sells a day per bag.",
    input: z.object({ bag: slug, pct: z.union([z.literal(25), z.literal(50), z.literal(75), z.literal(100)]), payout_asset: z.string().min(3) }),
    readOnly: false,
    run: async ({ bag, pct, payout_asset }, a) => trading.sell(a, { slug: bag, pct, payoutAssetId: payout_asset }),
  }),

  tool({
    name: "order_next",
    title: "Next step of an order",
    description: "Move an order on and say what to do next: pay (deposit), sign_intents (fees), sign_payloads (swaps), wait, or done.",
    input: z.object({ order_id: z.number().int().positive() }),
    readOnly: false,
    run: async ({ order_id }, a) => trading.next(a, order_id),
  }),

  tool({
    name: "order_sign",
    title: "Send signatures for an order",
    description: "Send the signed fee intents and/or signed swap payloads that order_next asked for. Returns the next step.",
    input: z.object({
      order_id: z.number().int().positive(),
      fees: signedIn.optional(),
      legs: z.array(z.object({ seq: z.number().int().min(0), signed: signedIn })).max(10).optional(),
    }),
    readOnly: false,
    run: async ({ order_id, fees, legs }, a) =>
      trading.sign(a, { orderId: order_id, fees: fees as SignedRawEd25519 | undefined, legs: legs as { seq: number; signed: SignedRawEd25519 }[] | undefined }),
  }),
];

export const MONEY_TOOLS = new Set(["buy", "sell", "order_sign"]);
