// Order engine end-to-end without money: real 1Click quotes and payloads, contract simulation instead of execution.
// Usage: pnpm tsx --env-file=.env.local --conditions=react-server scripts/probes/order-e2e.ts
import { eq } from "drizzle-orm";
import { db, schema } from "../../src/db";
import { deriveBasketKey, seedFromSignature } from "../../src/lib/intents/keys";
import { signIntents, signRaw } from "../../src/lib/intents/payload";
import { simulateIntents } from "../../src/lib/intents/rpc";
import { createBuyOrder, createSellOrder, feeIntentsFor, markFunded, orderView } from "../../src/lib/trade/orders";
import { oneclick } from "../../src/lib/oneclick";

const expectBalanceError = async (label: string, signed: Parameters<typeof simulateIntents>[0][number]) => {
  try {
    await simulateIntents([signed]);
    console.log(`  ${label}: simulate passed (unexpected with an empty account)`);
  } catch (e) {
    const m = (e as Error).message;
    console.log(`  ${label}: ${/insufficient balance/.test(m) ? "signature + payload accepted, stopped only by empty balance ✓" : "FAILED " + m.slice(0, 200)}`);
  }
};

async function main() {
  process.env.PLATFORM_FEE_ACCOUNT ||= "stonkbag-fees.near"; // test value so the platform fee path runs
  const tag = `e2e-${Date.now()}`;
  const [user] = await db().insert(schema.users).values({ walletChain: "evm", walletAddress: `0x${tag}` }).returning();
  const s = { userId: user.id, chain: "evm" as const, address: user.walletAddress };
  const basketId = 4; // Big Tech vs Bitcoin (QQQ, BTC, ETH)
  const key = deriveBasketKey(seedFromSignature(crypto.getRandomValues(new Uint8Array(64))), basketId);
  const [position] = await db().insert(schema.positions).values({ userId: user.id, basketId, accountId: key.accountId, keyMode: "derived", recoveryKeyAddedAt: new Date() }).returning();
  console.log("basket account:", key.accountId);

  try {
    console.log("1. create buy order ($40, pay USDC on Arbitrum)");
    const { order } = await createBuyOrder(s, { basketId, usd: 40, payAssetId: "nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near", refundAddress: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e" });
    const v1 = await orderView(order.id);
    console.log(`   status=${v1.order.status} next=${v1.next} deposit ${v1.order.deposit?.amountInFormatted} USDC → ${v1.order.deposit?.address?.slice(0, 12)}…`);

    console.log("2. pretend $39.95 USDC arrived (no real funds)");
    const [o] = await db().select().from(schema.orders).where(eq(schema.orders.id, order.id));
    await markFunded(o, position, 39_950_000n);
    const v2 = await orderView(order.id);
    console.log(`   status=${v2.order.status} next=${v2.next} fees=${v2.fees.map((f) => `${f.kind}:${Number(f.amount) / 1e6}`).join(", ")} legs=${v2.legs.map((l) => `${l.seq}:${Number(l.amountIn) / 1e6}`).join(", ")}`);

    console.log("3. fee transfer signed by the basket key");
    const { intents } = await feeIntentsFor(s, order.id);
    await expectBalanceError("fee transfer", signIntents(key, intents));

    console.log("4. swap legs: real quote + 1Click payload, signed by the basket key");
    await db().update(schema.orders).set({ status: "fees_paid" }).where(eq(schema.orders.id, order.id));
    // prepareLeg() refuses on an empty account (correct), so run its 1Click steps directly here.
    for (const leg of v2.legs) {
      const q = await oneclick.quote({ dry: false, slippageTolerance: 100, originAsset: leg.assetFrom, depositType: "INTENTS", destinationAsset: leg.assetTo, amount: leg.amountIn, recipient: key.accountId, recipientType: "INTENTS", refundTo: key.accountId, refundType: "INTENTS" });
      const gen = await oneclick.generateIntent(q.quote.depositAddress!, key.accountId, "raw_ed25519");
      await expectBalanceError(`leg ${leg.seq} → ${q.quote.amountOutFormatted}`, signRaw(key, gen.intent.payload as string));
    }

    console.log("5. sell from an empty account (after closing the buy)");
    await db().update(schema.orders).set({ status: "complete" }).where(eq(schema.orders.id, order.id));
    try {
      await createSellOrder(s, { positionId: position.id, pct: 100, payoutAssetId: "nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near", payoutAddress: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e" });
    } catch (e) {
      console.log("   refused:", (e as Error).message);
    }
  } finally {
    const orders = await db().select().from(schema.orders).where(eq(schema.orders.positionId, position.id));
    for (const o of orders) await db().delete(schema.orders).where(eq(schema.orders.id, o.id));
    await db().delete(schema.positions).where(eq(schema.positions.id, position.id));
    await db().delete(schema.users).where(eq(schema.users.id, user.id));
    console.log("cleaned up test rows");
    process.exit(0);
  }
}
main();
