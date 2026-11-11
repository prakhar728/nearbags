// Preflight a buy: quote every leg and run the price guard. No money moves.
import { rateLimit } from "@/lib/ratelimit";
import { z } from "zod";
import { AGENT_MAX_WEIGHT_BPS, minBuyUsd, RULES, validateWeights } from "@/lib/basket-rules";
import { handle, HttpError } from "@/lib/auth/session";
import { getSettings } from "@/lib/settings";
import { platformFee } from "@/lib/trade/orders";
import { preflightBuy } from "@/lib/trade/preflight";
import { buyBlockReason, paused } from "@/lib/trade/availability";

const Body = z.object({
  weights: z.array(z.object({ assetId: z.string(), weightBps: z.number().int() })).min(1).max(10),
  usd: z.number().positive(),
  creatorFeeBps: z.number().int().min(0).max(RULES.maxCreatorFeeBps),
  agent: z.boolean().optional(),
});


export async function POST(request: Request) {
  return handle(async () => {
    await rateLimit("preflight", 20, 60_000);
    const p = Body.safeParse(await request.json());
    if (!p.success) throw new HttpError(400, "Malformed preflight request.");
    const { weights, usd, creatorFeeBps, agent } = p.data;
    const settings = await getSettings();
    if (settings.buysPaused) throw new HttpError(503, "Buying is paused for a moment. Selling still works.");
    const delisted = weights.filter((w) => settings.delisted.includes(w.assetId)).map((w) => w.assetId);
    if (delisted.length) throw new HttpError(409, `${delisted.join(", ")} can't be bought right now.`);
    // Live baskets can sit outside the 5–50% creation rule once an agent has rebalanced them.
    const errs = validateWeights(weights, { maxWeightBps: AGENT_MAX_WEIGHT_BPS });
    if (errs.length) throw new HttpError(400, errs.join(" "));
    const blocked = buyBlockReason(await paused(weights.map((w) => w.assetId)));
    if (blocked) throw new HttpError(409, blocked);
    const pf = platformFee(Boolean(agent)).bps;
    const min = minBuyUsd(weights, creatorFeeBps + pf);
    if (usd < min) throw new HttpError(400, `This basket's minimum buy is $${min}.`);
    if (usd > RULES.maxBuyUsd) throw new HttpError(400, `The maximum buy is $${RULES.maxBuyUsd} for now.`);
    const result = await preflightBuy({
      weights,
      grossUsdc: BigInt(Math.floor(usd * 1e6)),
      creatorFeeBps,
      platformFeeBps: pf,
    });
    return Response.json({ minBuyUsd: min, ...result }, { headers: { "Cache-Control": "no-store" } });
  });
}
