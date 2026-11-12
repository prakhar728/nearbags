// Read-only tools for the public nearbags MCP server (src/app/api/mcp/route.ts). Every tool reads data the website
// already shows to anyone, through the same shared caches the pages use, so an agent calling them costs about what a
// visitor does. Nothing here signs, moves money, reads a session or returns a creator's private strategy.
import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { z } from "zod";
import { agentRunsFor } from "@/lib/agent/run";
import { getAnalyticsView, getLiveReturn } from "@/lib/analytics/cached";
import { ASSETS, getAsset } from "@/lib/assets";
import { basketKind } from "@/lib/basket-kind";
import { basketTag, getBasketPage, getCreatorProfile, listExploreBaskets } from "@/lib/basket-pages";
import { platformFeeBpsFor, type BasketView } from "@/lib/baskets";
import { creatorName } from "@/lib/format";
import { getSettings } from "@/lib/settings";
import { buyBlockReason, paused, pausedAcrossList } from "@/lib/trade/availability";

export const SITE = "https://nearbags.com";
const pct = (x: number | null | undefined, digits = 2) => (x == null || !Number.isFinite(x) ? null : +(x * 100).toFixed(digits));
const bpsPct = (bps: number) => +(bps / 100).toFixed(2);
const weightsOf = (b: BasketView) => b.assets.map(({ assetId, weightBps }) => ({ assetId, weightBps }));
const VENUE = { oneclick: "NEAR Intents (1Click)", rhea: "Rhea Finance" } as const;

function summary(b: BasketView) {
  return {
    slug: b.slug,
    name: b.name,
    tagline: b.tagline,
    kind: basketKind(b.assets),
    status: b.status,
    url: `${SITE}/b/${b.slug}`,
    creator: b.isHouse ? "nearbags (house bag)" : creatorName(b.creator),
    agentManaged: Boolean(b.agent),
    creatorFeePct: bpsPct(b.feeBps),
    platformFeePct: bpsPct(platformFeeBpsFor(Boolean(b.agent))),
    minBuyUsd: b.minBuyUsd,
    assets: b.assets.map((a) => ({ id: a.assetId, weightPct: bpsPct(a.weightBps) })),
    publishedAt: b.publishedAt,
  };
}

// Agent runs are a small read, but agents may poll: share one cached copy per bag for a minute or so.
async function cachedRuns(basketId: number, slug: string, limit: number) {
  "use cache: remote";
  cacheLife("minutes");
  cacheTag(basketTag(slug));
  return agentRunsFor(basketId, limit);
}

const KINDS = ["stocks", "crypto", "mixed", "meme"] as const;

export interface Tool<S extends z.ZodType = z.ZodType> {
  name: string;
  title: string;
  description: string;
  input: S;
  run: (args: z.infer<S>) => Promise<unknown>;
}
const tool = <S extends z.ZodType>(t: Tool<S>) => t as unknown as Tool;

export const TOOLS: Tool[] = [
  tool({
    name: "list_bags",
    title: "List bags",
    description:
      "List the bags (baskets) people can buy on nearbags: name, kind, creator, fees, minimum buy and target weights. Filter by kind, by an asset it holds, or by words in its name or tagline. Use get_bag for the thesis, performance and whether it can be bought right now.",
    input: z.object({
      kind: z.enum(KINDS).optional().describe("stocks = tokenized US stocks/ETFs only, crypto, mixed = both, meme = holds NEAR meme coins"),
      holds: z.string().max(12).optional().describe("Only bags holding this asset id, e.g. NVDA or BTC (see list_assets)"),
      query: z.string().max(80).optional().describe("Words to match in the name or tagline"),
    }),
    run: async ({ kind, holds, query }) => {
      const q = query?.toLowerCase().trim();
      const bags = (await listExploreBaskets())
        .filter((b) => b.status === "live")
        .filter((b) => !kind || basketKind(b.assets) === kind)
        .filter((b) => !holds || b.assets.some((a) => a.assetId.toLowerCase() === holds.toLowerCase()))
        .filter((b) => !q || `${b.name} ${b.tagline}`.toLowerCase().includes(q));
      return { count: bags.length, bags: bags.map(summary) };
    },
  }),

  tool({
    name: "get_bag",
    title: "Get a bag",
    description:
      "Everything public about one bag: thesis, risks, each asset's weight and why it's there, fees, the agent's public limits if it has one, historical backtest stats per window, the live return since it was published, and whether each asset can be bought and sold through NEAR Intents right now.",
    input: z.object({ slug: z.string().min(1).max(80).describe("The bag's slug from list_bags, e.g. blue-chip-crypto") }),
    run: async ({ slug }) => {
      const page = await getBasketPage(slug);
      if (!page) throw new Error(`No bag called "${slug}". Use list_bags to see the slugs.`);
      const b = page.basket;
      const weights = weightsOf(b);
      const [view, live, p] = await Promise.all([
        getAnalyticsView(weights).catch(() => null),
        b.publishedAt ? getLiveReturn(weights, b.publishedAt).catch(() => null) : null,
        paused(b.assets.map((a) => a.assetId)).catch(() => null),
      ]);
      const backtest =
        view && !("error" in view)
          ? {
              note: "$1,000 bought at the start of each window and held. Historical, not a forecast.",
              windows: view.windows.map((w) => ({
                window: w.label,
                start: w.start,
                end: w.end,
                totalReturnPct: pct(w.stats.totalReturn),
                cagrPct: pct(w.stats.cagr),
                maxDrawdownPct: pct(w.stats.maxDrawdown),
                volatilityPct: pct(w.stats.volatility),
                sharpe: w.stats.sharpe == null ? null : +w.stats.sharpe.toFixed(2),
              })),
              historyLimitedBy: view.limitedBy,
            }
          : null;
      return {
        ...summary(b),
        horizon: b.horizon,
        thesis: b.thesis,
        risks: b.risks,
        exitSignal: b.exitSignal,
        assets: b.assets.map((a) => {
          const asset = getAsset(a.assetId);
          return { id: a.assetId, name: asset.name, kind: asset.kind, weightPct: bpsPct(a.weightBps), why: a.why };
        }),
        agent: b.agent
          ? {
              rule: b.agent.template ?? "written strategy (private to the creator)",
              limits: {
                minWeightPct: bpsPct(b.agent.limits.minWeightBps),
                maxWeightPct: bpsPct(b.agent.limits.maxWeightBps),
                maxChangePerRunPct: bpsPct(b.agent.limits.maxChangeBps),
                maxTurnoverPerRunPct: bpsPct(b.agent.limits.maxTurnoverBps),
              },
              history: "Use get_agent_runs for its recent decisions and proofs.",
            }
          : null,
        liveSincePublish: live ? { returnPct: pct(live.value), since: live.since, asOf: live.asOf } : null,
        backtest,
        // Same rule as the buy button: if any asset can't be sold, buying is paused too.
        tradableNow: p
          ? { canBuy: buyBlockReason(p) == null, canSell: p.cantSell.length === 0, cantBuy: p.cantBuy, cantSell: p.cantSell, reason: buyBlockReason(p) }
          : { canBuy: null, note: "Couldn't check right now." },
        howToBuy: `Open ${SITE}/b/${b.slug}, connect a NEAR or EVM wallet and pay with any token on any supported chain. Buying from an agent isn't available yet.`,
        notes: b.assets.some((a) => ["stock", "etf"].includes(getAsset(a.assetId).kind))
          ? "Tokenized stocks (Ondo Global Markets) give price exposure only and aren't available to US persons."
          : undefined,
      };
    },
  }),

  tool({
    name: "get_agent_runs",
    title: "Agent decisions",
    description:
      "Recent decisions by an AI-agent bag: when it ran, what started it, the weights before and after, its stated reason, and links to the attestation proving which code made the decision. The creator's written strategy is never included.",
    input: z.object({
      slug: z.string().min(1).max(80),
      limit: z.number().int().min(1).max(20).default(5),
    }),
    run: async ({ slug, limit }) => {
      const page = await getBasketPage(slug);
      if (!page) throw new Error(`No bag called "${slug}".`);
      if (!page.basket.agent) return { slug, agentManaged: false, runs: [] };
      const toPct = (w: Record<string, number> | null) => (w ? Object.fromEntries(Object.entries(w).map(([k, v]) => [k, bpsPct(v)])) : null);
      const runs = await cachedRuns(page.basket.id, slug, limit);
      return {
        slug,
        agentManaged: true,
        runs: runs.map((r) => ({
          at: r.at,
          startedBy: r.trigger === "cron" ? "daily schedule" : r.trigger,
          status: r.status,
          weightsBeforePct: toPct(r.before),
          weightsAfterPct: toPct(r.after),
          reason: r.reason,
          model: r.model,
          decisionProof: r.decideProof ? `${SITE}${r.decideProof}` : null,
          holdersRebalanced: r.holders,
          skipped: r.skipped,
          error: r.error,
        })),
      };
    },
  }),

  tool({
    name: "get_creator",
    title: "Get a creator",
    description: "A creator's public profile and the bags they publish.",
    input: z.object({ handle_or_address: z.string().min(2).max(80).describe("Their handle (without @) or wallet address") }),
    run: async ({ handle_or_address }) => {
      const c = await getCreatorProfile(handle_or_address.replace(/^@/, ""));
      if (!c) throw new Error(`No creator "${handle_or_address}".`);
      return {
        name: creatorName(c),
        handle: c.handle,
        wallet: c.address,
        chain: c.chain,
        bio: c.bio,
        x: c.xUrl,
        joined: c.createdAt,
        url: `${SITE}/c/${encodeURIComponent(c.handle ?? c.address)}`,
        bags: c.baskets.map(summary),
      };
    },
  }),

  tool({
    name: "list_assets",
    title: "List assets",
    description:
      "Every asset a bag can hold, with its kind and where it trades, and whether it can be bought and sold right now (checked with small live quotes, refreshed every 10 minutes).",
    input: z.object({ kind: z.enum(["stock", "etf", "crypto", "stable", "meme"]).optional() }),
    run: async ({ kind }) => {
      const [p, settings] = await Promise.all([pausedAcrossList().catch(() => null), getSettings().catch(() => null)]);
      return {
        checkedLive: Boolean(p),
        assets: ASSETS.filter((a) => !kind || a.kind === kind).map((a) => ({
          id: a.id,
          name: a.name,
          kind: a.kind,
          tradesOn: VENUE[a.venue ?? "oneclick"],
          canBuy: settings?.delisted.includes(a.id) ? false : p ? !p.cantBuy.includes(a.id) : null,
          canSell: p ? !p.cantSell.includes(a.id) : null,
          ...(settings?.delisted.includes(a.id) ? { note: "Delisted by nearbags: holders can still sell." } : p?.why?.[a.id] ? { note: p.why[a.id] } : {}),
        })),
      };
    },
  }),
];

export const INSTRUCTIONS = [
  "nearbags (https://nearbags.com) sells bags: baskets of tokenized US stocks and ETFs (Ondo Global Markets), crypto and a few NEAR meme coins, bought in one payment with any token from any chain through NEAR Intents.",
  "Each holder's bag is their own NEAR Intents account that only their wallet controls. Some bags are rebalanced by an AI agent that runs in a TEE and publishes a proof for every decision.",
  "These tools are read-only; a creator's agent key (made on their nearbags profile) adds tools to manage their own bags. To buy or sell, send the person to the bag's url. Backtests are historical, not forecasts, and nothing here is financial advice. Tokenized stocks aren't available to US persons.",
].join(" ");
