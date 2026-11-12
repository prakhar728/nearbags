// MCP tools that need an agent key: manage the key owner's own baskets. They call the same functions as the
// website's routes (lib/creator/actions.ts), so the rules are identical. Nothing here buys, sells or signs:
// a new basket still goes live only after its creator buys it themselves on the site.
import "server-only";
import { z } from "zod";
import { audit, type AgentActor } from "@/lib/agent-keys";
import { agentRunsFor, runAgent } from "@/lib/agent/run";
import { TEMPLATE_IDS, type TemplateId } from "@/lib/agent/templates";
import { getAnalyticsView } from "@/lib/analytics/cached";
import { minBuyUsd, validateWeights } from "@/lib/basket-rules";
import { HORIZONS } from "@/lib/basket-text";
import { listPendingByCreator } from "@/lib/basket-pages";
import { listBasketsByCreator, platformFeeBpsFor } from "@/lib/baskets";
import { HttpError } from "@/lib/auth/session";
import { closeBasket, createBasket, editBasket } from "@/lib/creator/actions";
import { creatorName } from "@/lib/format";
import { rateLimit } from "@/lib/ratelimit";
import { loadOwnBasket } from "@/lib/users";
import { SITE } from "./tools";

export interface AuthedTool<S extends z.ZodType = z.ZodType> {
  name: string;
  title: string;
  description: string;
  input: S;
  readOnly: boolean;
  run: (args: z.infer<S>, actor: AgentActor) => Promise<unknown>;
}
const tool = <S extends z.ZodType>(t: AuthedTool<S>) => t as unknown as AuthedTool;

const pctToBps = (p: number) => Math.round(p * 100);
const bpsPct = (bps: number) => +(bps / 100).toFixed(2);
const pct = (x: number | null | undefined) => (x == null || !Number.isFinite(x) ? null : +(x * 100).toFixed(2));

/** Turn validation problems into one message the agent can act on. */
function problems(errors: string[]): never {
  throw new HttpError(400, `Not saved. Fix these and try again: ${errors.join(" ")}`);
}

const weightsIn = z
  .array(z.object({ asset: z.string().min(1).max(16).describe("Asset id from list_assets, e.g. NVDA or BTC"), weight_pct: z.number().int().describe("Whole percent") }))
  .min(1)
  .max(20);

const agentIn = z
  .object({
    rule: z.enum(TEMPLATE_IDS as [TemplateId, ...TemplateId[]]).optional().describe("A public rule: fixed, equal, risk, trend, voltarget or momentum. Use this or strategy."),
    strategy: z.string().min(20).max(2000).optional().describe("Your own plain-English strategy for the AI. Private: only you and the agent see it."),
    limits: z
      .object({
        min_weight_pct: z.number().min(0).max(20).optional(),
        max_weight_pct: z.number().min(0).max(80).optional(),
        max_change_pct: z.number().min(1).max(50).optional().describe("Most any weight can move in one run"),
        max_turnover_pct: z.number().min(1).max(30).optional().describe("Most of the bag that can trade in one run"),
      })
      .optional(),
  })
  .describe("Optional: let the nearbags AI agent rebalance this bag daily. Give a rule or a strategy, not both.");

export const CREATOR_TOOLS: AuthedTool[] = [
  tool({
    name: "whoami",
    title: "Who am I",
    description: "The nearbags account this agent key belongs to and what the key may do.",
    input: z.object({}),
    readOnly: true,
    run: async (_args, a) => ({
      account: creatorName({ handle: a.user.handle, address: a.user.walletAddress }),
      wallet: a.user.walletAddress,
      chain: a.user.walletChain,
      profile: `${SITE}/c/${encodeURIComponent(a.user.handle ?? a.user.walletAddress)}`,
      key: { name: a.keyName, starts: a.prefix, scopes: a.scopes },
      canDo: "Create, edit and close your bags, preview weights, and run your AI-agent bags. It can't buy, sell, withdraw or sign anything.",
    }),
  }),

  tool({
    name: "my_bags",
    title: "My bags",
    description: "Your bags: live and closed ones, plus pending ones that go live after you buy them yourself.",
    input: z.object({}),
    readOnly: true,
    run: async (_args, a) => {
      const [published, pending] = await Promise.all([listBasketsByCreator(a.user.id), listPendingByCreator(a.user.id)]);
      return {
        published: published.map((b) => ({
          slug: b.slug,
          name: b.name,
          status: b.status,
          url: `${SITE}/b/${b.slug}`,
          agentManaged: Boolean(b.agent),
          creatorFeePct: bpsPct(b.feeBps),
          assets: b.assets.map((x) => ({ id: x.assetId, weightPct: bpsPct(x.weightBps) })),
        })),
        pending: pending.map((b) => ({ slug: b.slug, name: b.name, url: `${SITE}/b/${b.slug}`, nextStep: "Goes live after you buy it yourself on its page." })),
      };
    },
  }),

  tool({
    name: "preview_bag",
    title: "Preview weights",
    description:
      "Check a set of assets and weights before creating a bag: whether they pass the rules (2 to 10 assets, 5% to 50% each, whole percents adding to 100), backtest stats per window, and the minimum buy. Limited to 20 previews an hour.",
    input: z.object({
      assets: weightsIn,
      creator_fee_pct: z.number().min(0).max(1).default(0.5),
      agent: z.boolean().default(false).describe("Will it be AI-agent managed (changes the platform fee)"),
    }),
    readOnly: true,
    run: async ({ assets, creator_fee_pct, agent }, a) => {
      await rateLimit("mcp-preview", 20, 3600_000, String(a.keyId));
      const weights = assets.map((x) => ({ assetId: x.asset.toUpperCase(), weightBps: pctToBps(x.weight_pct) }));
      const errors = validateWeights(weights);
      if (errors.length) return { valid: false, errors };
      const view = await getAnalyticsView(weights);
      if ("error" in view) return { valid: false, errors: [view.error] };
      return {
        valid: true,
        minBuyUsd: minBuyUsd(weights, pctToBps(creator_fee_pct) + platformFeeBpsFor(agent)),
        backtest: {
          note: "$1,000 bought at the start of each window and held. Historical, not a forecast.",
          windows: view.windows.map((w) => ({
            window: w.label,
            totalReturnPct: pct(w.stats.totalReturn),
            cagrPct: pct(w.stats.cagr),
            maxDrawdownPct: pct(w.stats.maxDrawdown),
            volatilityPct: pct(w.stats.volatility),
          })),
          historyLimitedBy: view.limitedBy,
        },
      };
    },
  }),

  tool({
    name: "create_bag",
    title: "Create a bag",
    description:
      "Create a bag under your account. It starts as pending and goes live only after you buy it yourself on its page. After that, its name, assets, weights and fee can't change (an AI-agent bag's weights move only through its agent). Up to 5 new bags a day.",
    input: z.object({
      name: z.string().min(1).max(60),
      tagline: z.string().min(1).max(140),
      thesis: z.string().min(1).describe("Why this bag, in plain words. Markdown allowed."),
      risks: z.string().min(1).describe("What could go wrong"),
      horizon: z.enum(HORIZONS).describe("How long it's meant to be held"),
      exit_signal: z.string().optional().describe("What would make you close it"),
      creator_fee_pct: z.number().min(0).max(1).describe("Your fee on buys: 0 to 1, in 0.05 steps"),
      assets: z
        .array(
          z.object({
            asset: z.string().min(1).max(16),
            weight_pct: z.number().int(),
            why: z.string().min(1).describe("Why this asset is in the bag"),
          }),
        )
        .min(2)
        .max(10),
      agent: agentIn.optional(),
    }),
    readOnly: false,
    run: async (args, a) => {
      const body = {
        name: args.name,
        tagline: args.tagline,
        thesis: args.thesis,
        risks: args.risks,
        horizon: args.horizon,
        exitSignal: args.exit_signal,
        feeBps: pctToBps(args.creator_fee_pct),
        assets: args.assets.map((x) => ({ assetId: x.asset.toUpperCase(), weightBps: pctToBps(x.weight_pct), why: x.why })),
        // The key's owner accepted the risk notice before they could make the key.
        acceptRisk: true,
        ...(args.agent
          ? {
              agent: {
                template: args.agent.rule ?? null,
                strategy: args.agent.strategy ?? "",
                limits: args.agent.limits && {
                  ...(args.agent.limits.min_weight_pct != null ? { minWeightBps: pctToBps(args.agent.limits.min_weight_pct) } : {}),
                  ...(args.agent.limits.max_weight_pct != null ? { maxWeightBps: pctToBps(args.agent.limits.max_weight_pct) } : {}),
                  ...(args.agent.limits.max_change_pct != null ? { maxChangeBps: pctToBps(args.agent.limits.max_change_pct) } : {}),
                  ...(args.agent.limits.max_turnover_pct != null ? { maxTurnoverBps: pctToBps(args.agent.limits.max_turnover_pct) } : {}),
                },
              },
            }
          : {}),
      };
      if (args.agent?.rule && args.agent?.strategy) problems(["Give the agent a rule or a strategy, not both."]);
      if (args.agent && !args.agent.rule && !args.agent.strategy) problems(["Give the agent a rule or a strategy."]);
      const r = await createBasket(a.user, body, { allowHouse: false });
      if (!r.ok) problems(r.errors);
      await audit(a.user, a.prefix, "mcp.create_bag", r.value.slug, { name: args.name });
      return {
        created: true,
        slug: r.value.slug,
        status: r.value.status,
        url: `${SITE}/b/${r.value.slug}`,
        minBuyUsd: r.value.minBuyUsd,
        nextStep: `It's pending. It goes live after you buy at least $${r.value.minBuyUsd} of it yourself at ${SITE}/b/${r.value.slug}, with your wallet.`,
      };
    },
  }),

  tool({
    name: "edit_bag",
    title: "Edit a bag's text",
    description:
      "Change the words on one of your bags: tagline, thesis, risks, exit signal, or why an asset is there. Every change is shown publicly in the bag's edit history. Name, assets, weights and fee can't change.",
    input: z.object({
      slug: z.string().min(1).max(80),
      tagline: z.string().min(1).optional(),
      thesis: z.string().min(1).optional(),
      risks: z.string().min(1).optional(),
      exit_signal: z.string().optional().describe("Empty string removes it"),
      why: z.record(z.string(), z.string().min(1)).optional().describe("Asset id → new reason, e.g. { \"NVDA\": \"...\" }"),
    }),
    readOnly: false,
    run: async ({ slug, exit_signal, ...rest }, a) => {
      const body = { ...rest, ...(exit_signal !== undefined ? { exitSignal: exit_signal } : {}) };
      const r = await editBasket(a.user.id, slug, body);
      if (!r.ok) problems(r.errors);
      if (r.value.changed.length) await audit(a.user, a.prefix, "mcp.edit_bag", slug, { changed: r.value.changed });
      return { slug, changed: r.value.changed, url: `${SITE}/b/${slug}` };
    },
  }),

  tool({
    name: "close_bag",
    title: "Close a bag",
    description: "Stop new buys of one of your bags. Holders can still sell and withdraw. This can't be undone, so pass confirm: true.",
    input: z.object({ slug: z.string().min(1).max(80), confirm: z.literal(true).describe("Must be true") }),
    readOnly: false,
    run: async ({ slug }, a) => {
      const r = await closeBasket(a.user.id, slug);
      await audit(a.user, a.prefix, "mcp.close_bag", slug, null);
      return { slug, ...r };
    },
  }),

  tool({
    name: "run_agent",
    title: "Run a bag's agent",
    description:
      "Start a rebalance now on one of your live AI-agent bags, instead of waiting for the daily run. The agent decides inside the bag's limits, then swaps inside each opted-in holder's account. At most once every 10 minutes; it can take a minute or two.",
    input: z.object({ slug: z.string().min(1).max(80) }),
    readOnly: false,
    run: async ({ slug }, a) => {
      const b = await loadOwnBasket(slug, a.user.id);
      await audit(a.user, a.prefix, "mcp.run_agent", slug, null);
      const runId = await runAgent(b.id, "creator");
      const [run] = (await agentRunsFor(b.id, 3)).filter((r) => r.id === runId);
      return run
        ? {
            slug,
            status: run.status,
            reason: run.reason,
            weightsBeforePct: run.before && Object.fromEntries(Object.entries(run.before).map(([k, v]) => [k, bpsPct(v)])),
            weightsAfterPct: run.after && Object.fromEntries(Object.entries(run.after).map(([k, v]) => [k, bpsPct(v)])),
            holdersRebalanced: run.holders,
            skipped: run.skipped,
            decisionProof: run.decideProof ? `${SITE}${run.decideProof}` : null,
            error: run.error,
          }
        : { slug, runId, note: "Started. Use get_agent_runs to follow it." };
    },
  }),
];
