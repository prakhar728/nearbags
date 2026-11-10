// The agent for agent-managed baskets.
//
// A run: the strategist (OutLayer, attested) proposes new target weights from the creator's strategy and the market,
// clamped to hard limits. They become the basket's targets. Then every holder who opted in (their basket account
// carries the agent's key) gets a reset order. The signer (OutLayer, key bound to its build) signs each swap leg only
// after checking at 1Click that the swap pays back into the same account. The order engine is the one holders use;
// the agent acts on a holder's position under that holder's id, which is all the engine's ownership checks read.
import "server-only";
import { and, desc, eq, gte, inArray, isNotNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { getAsset, USDC } from "@/lib/assets";
import { getBasketById } from "@/lib/baskets";
import { revalidateBasket } from "@/lib/basket-pages";
import type { Session } from "@/lib/auth/session";
import { HttpError } from "@/lib/auth/session";
import { livePrice } from "@/lib/prices/live";
import { createResetOrder, prepareLeg, refreshOrder, submitLeg } from "@/lib/trade/orders";
import { untradeable } from "@/lib/trade/availability";
import type { SignedRawEd25519 } from "@/lib/intents/payload";
import { proofUrl, runModule, signerModule, strategistModule } from "./outlayer";
export { DEFAULT_LIMITS, minMaxWeightBps, sanitizeAgentConfig } from "./config";

export const MAX_LEG_USD = 100; // the signer's own hard cap is $250; this is tighter for now
const RUN_BUDGET_MS = 200_000; // stay inside one serverless invocation; unfinished orders continue on the next pump
const AGENT_KEY_SETTING = "agent_signer";

type Run = typeof schema.agentRuns.$inferSelect;

// ---------- the agent's key ----------

export interface AgentKey {
  hash: string; // the signer build this key belongs to
  publicKey: string;
  accountId: string;
  txHash: string; // the attested whoami run
}

/** The signer's public key for this caller, cached per build. Asking costs one OutLayer run. */
export async function agentKey(opts: { refresh?: boolean } = {}): Promise<AgentKey | null> {
  const mod = signerModule();
  if (!mod) return null;
  const [row] = await db().select().from(schema.settings).where(eq(schema.settings.key, AGENT_KEY_SETTING));
  const cached = row?.value as AgentKey | undefined;
  if (cached?.hash === mod.hash && !opts.refresh) return cached;
  if (!opts.refresh) return null; // only an explicit refresh spends a run
  const r = await runModule<{ account_id: string; public_key: string }>(mod, { op: "whoami" }, { seconds: 10 });
  if (!r.ok || !r.result) throw new Error(`The signer couldn't report its key: ${r.error}`);
  const key: AgentKey = { hash: mod.hash, publicKey: r.result.public_key, accountId: r.result.account_id, txHash: r.txHash };
  await db().insert(schema.settings).values({ key: AGENT_KEY_SETTING, value: key }).onConflictDoUpdate({ target: schema.settings.key, set: { value: key } });
  return key;
}

// ---------- a run ----------

const ownerSession = async (userId: number): Promise<Session> => {
  const [u] = await db().select().from(schema.users).where(eq(schema.users.id, userId));
  return { userId, chain: u.walletChain, address: u.walletAddress };
};

async function setRun(id: number, patch: Partial<Run>) {
  await db().update(schema.agentRuns).set({ ...patch, updatedAt: new Date() }).where(eq(schema.agentRuns.id, id));
}

async function marketData(assetIds: string[]) {
  return Promise.all(
    assetIds.map(async (id) => {
      const a = getAsset(id);
      const price = (await livePrice(id)).price;
      const closes = await db()
        .select({ close: schema.priceDaily.close })
        .from(schema.priceDaily)
        .where(eq(schema.priceDaily.ticker, a.refTicker))
        .orderBy(desc(schema.priceDaily.date))
        .limit(8);
      const chg = (n: number) => (closes[n] ? Math.round((price / closes[n].close - 1) * 10_000) / 100 : null);
      return { id: a.id, name: a.name, price, change_1d: chg(1), change_7d: chg(7) };
    }),
  );
}

/** Start a run: decide new weights, then rebalance opted-in holders. Returns the run id; pumping continues the swaps. */
export async function runAgent(basketId: number, trigger: Run["trigger"]): Promise<number> {
  const [row] = await db().select().from(schema.baskets).where(eq(schema.baskets.id, basketId));
  if (!row?.agent) throw new HttpError(409, "This basket isn't agent-managed.");
  if (row.status !== "live") throw new HttpError(409, "The agent runs on live baskets only.");
  const recent = await db()
    .select()
    .from(schema.agentRuns)
    .where(and(eq(schema.agentRuns.basketId, basketId), gte(schema.agentRuns.createdAt, new Date(Date.now() - 10 * 60_000))));
  if (recent.some((r) => r.status === "deciding" || r.status === "rebalancing")) throw new HttpError(409, "The agent is already working on this basket.");
  if (trigger !== "admin" && recent.length) throw new HttpError(429, "The agent ran in the last 10 minutes. Try again shortly.");

  const strategist = strategistModule();
  if (!strategist) throw new HttpError(503, "The strategist isn't configured yet.");
  const basket = (await getBasketById(basketId))!;
  // Don't move targets the agent couldn't trade toward; try again on the next run.
  const paused = await untradeable(basket.assets.map((a) => a.assetId));
  if (paused.length) throw new HttpError(409, `Trading is paused for ${paused.join(", ")} on NEAR Intents, so the agent will skip this run.`);
  const before = Object.fromEntries(basket.assets.map((a) => [a.assetId, a.weightBps]));
  const [run] = await db().insert(schema.agentRuns).values({ basketId, trigger, weightsBefore: before }).returning();

  try {
    const market = await marketData(basket.assets.map((a) => a.assetId));
    const cfg = row.agent;
    const d = await runModule<{ weights: number[]; reason: string; model: string }>(
      strategist,
      {
        op: "decide",
        strategy: cfg.strategy,
        assets: market.map((m, i) => ({ ...m, current_bps: basket.assets[i].weightBps })),
        limits: { min_weight_bps: cfg.limits.minWeightBps, max_weight_bps: cfg.limits.maxWeightBps, max_change_bps: cfg.limits.maxChangeBps, max_turnover_bps: cfg.limits.maxTurnoverBps },
      },
      { seconds: 60, secrets: strategistSecrets() },
    );
    if (!d.ok || !d.result) throw new Error(`The strategist refused: ${d.error}`);
    const w = d.result.weights;
    if (w.length !== basket.assets.length || w.some((x) => !Number.isInteger(x) || x < 0) || w.reduce((s, x) => s + x, 0) !== 10_000) {
      throw new Error("The strategist returned weights that don't add up.");
    }
    const after = Object.fromEntries(basket.assets.map((a, i) => [a.assetId, w[i]]));
    await db().transaction(async (tx) => {
      for (const [assetId, weightBps] of Object.entries(after)) {
        await tx.update(schema.basketAssets).set({ weightBps }).where(and(eq(schema.basketAssets.basketId, basketId), eq(schema.basketAssets.assetId, assetId)));
      }
      await tx.insert(schema.basketEdits).values({ basketId, field: "weights", oldValue: JSON.stringify(before), newValue: JSON.stringify(after) });
    });
    revalidateBasket(basket.slug);
    await setRun(run.id, { status: "rebalancing", weightsAfter: after, reason: d.result.reason, model: d.result.model, decideTx: d.txHash });

    // Reset orders for every opted-in holder whose account carries the current agent key.
    const key = await agentKey();
    const holders = key
      ? await db()
          .select()
          .from(schema.positions)
          .where(and(eq(schema.positions.basketId, basketId), isNotNull(schema.positions.agentKeyAddedAt), eq(schema.positions.agentPublicKey, key.publicKey)))
      : [];
    const orders: NonNullable<Run["orders"]> = [];
    for (const p of holders) {
      try {
        const { order } = await createResetOrder(await ownerSession(p.userId), p.id);
        orders.push({ positionId: p.id, orderId: order.id });
      } catch (e) {
        orders.push({ positionId: p.id, orderId: null, note: (e as Error).message.slice(0, 160) });
      }
    }
    await setRun(run.id, { orders, ...(orders.some((o) => o.orderId) ? {} : { status: "done" }) });
    if (orders.some((o) => o.orderId)) await pumpRun(run.id, Date.now() + RUN_BUDGET_MS);
    return run.id;
  } catch (e) {
    await setRun(run.id, { status: "failed", error: (e as Error).message.slice(0, 400) });
    throw e;
  }
}

function strategistSecrets() {
  const profile = process.env.AGENT_SECRETS_PROFILE?.trim();
  const accountId = process.env.AGENT_SECRETS_ACCOUNT?.trim();
  return profile && accountId ? { profile, accountId } : null;
}

// ---------- driving the swaps ----------

/** Advance one run's orders until they finish or the deadline passes: quote ready legs, have the signer sign, submit. */
export async function pumpRun(runId: number, deadline: number) {
  const [run] = await db().select().from(schema.agentRuns).where(eq(schema.agentRuns.id, runId));
  if (!run || run.status !== "rebalancing") return;
  const signer = signerModule();
  if (!signer) throw new Error("The signer isn't configured.");
  const basket = (await getBasketById(run.basketId))!;
  const assets = [...new Set([...basket.assets.map((a) => getAsset(a.assetId).intentsAssetId), USDC.intentsAssetId])];
  const signTxs = [...(run.signTxs ?? [])];
  const orderIds = (run.orders ?? []).flatMap((o) => (o.orderId ? [o.orderId] : []));
  const positions = orderIds.length ? await db().select().from(schema.positions).where(inArray(schema.positions.id, (run.orders ?? []).map((o) => o.positionId))) : [];

  while (Date.now() < deadline) {
    let open = 0;
    for (const orderId of orderIds) {
      const o = (run.orders ?? []).find((x) => x.orderId === orderId)!;
      const p = positions.find((x) => x.id === o.positionId)!;
      const s = await ownerSession(p.userId);
      const v = await refreshOrder(s, orderId);
      if (v.next === "done") continue;
      open++;
      if (v.next !== "run_legs") continue;
      for (const leg of v.legs.filter((l) => l.ready)) {
        try {
          const prep = await prepareLeg(s, orderId, leg.seq);
          const [row] = await db().select().from(schema.orderLegs).where(and(eq(schema.orderLegs.orderId, orderId), eq(schema.orderLegs.seq, leg.seq)));
          const r = await runModule<{ signed: SignedRawEd25519; usd: number }>(
            signer,
            { op: "sign_leg", account_id: prep.accountId, deposit_address: row.depositAddress, payload: prep.payload, assets, max_usd: MAX_LEG_USD },
            { seconds: 30 },
          );
          signTxs.push(r.txHash);
          if (!r.ok || !r.result) {
            await db().update(schema.orderLegs).set({ status: "failed", error: `Agent refused to sign: ${r.error}`.slice(0, 300) }).where(eq(schema.orderLegs.id, row.id));
            continue;
          }
          await submitLeg(s, orderId, leg.seq, r.result.signed);
        } catch (e) {
          console.error("agent leg", orderId, leg.seq, e);
        }
      }
    }
    await setRun(runId, { signTxs });
    if (!open) {
      await setRun(runId, { status: "done" });
      return;
    }
    await new Promise((r) => setTimeout(r, 5_000));
  }
}

/** Continue every unfinished run (cron and "run now" call this). */
export async function pumpAll(budgetMs = RUN_BUDGET_MS) {
  const deadline = Date.now() + budgetMs;
  const open = await db().select().from(schema.agentRuns).where(eq(schema.agentRuns.status, "rebalancing"));
  for (const r of open) await pumpRun(r.id, deadline);
}

/** Runs for a basket's page: newest first, public fields only (never the strategy). */
export async function agentRunsFor(basketId: number, limit = 10) {
  const rows = await db().select().from(schema.agentRuns).where(eq(schema.agentRuns.basketId, basketId)).orderBy(desc(schema.agentRuns.createdAt)).limit(limit);
  return rows.map((r) => ({
    id: r.id,
    at: r.createdAt.toISOString(),
    trigger: r.trigger,
    status: r.status,
    before: r.weightsBefore,
    after: r.weightsAfter,
    reason: r.reason,
    model: r.model,
    decideProof: r.decideTx ? proofUrl(r.decideTx) : null,
    swapProofs: (r.signTxs ?? []).slice(-12).map(proofUrl),
    holders: (r.orders ?? []).filter((o) => o.orderId).length,
    // Why holders weren't rebalanced (e.g. every swap below its minimum size), deduplicated.
    skipped: [...new Set((r.orders ?? []).filter((o) => !o.orderId && o.note).map((o) => o.note!))],
    error: r.error,
  }));
}


