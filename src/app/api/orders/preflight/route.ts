// Preflight a buy: quote every leg and run the price guard. No money moves.
import { z } from "zod";
import { minBuyUsd, RULES, validateWeights } from "@/lib/basket-rules";
import { handle, HttpError } from "@/lib/auth/session";
import { preflightBuy } from "@/lib/trade/preflight";

const Body = z.object({
  weights: z.array(z.object({ assetId: z.string(), weightBps: z.number().int() })).min(1).max(10),
  usd: z.number().positive(),
  creatorFeeBps: z.number().int().min(0).max(RULES.maxCreatorFeeBps),
});

const PLATFORM_FEE_BPS = Number(process.env.PLATFORM_FEE_BPS ?? 25);

export async function POST(request: Request) {
  return handle(async () => {
    const p = Body.safeParse(await request.json());
    if (!p.success) throw new HttpError(400, "Malformed preflight request.");
    const { weights, usd, creatorFeeBps } = p.data;
    const errs = validateWeights(weights);
    if (errs.length) throw new HttpError(400, errs.join(" "));
    const min = minBuyUsd(weights, creatorFeeBps + PLATFORM_FEE_BPS);
    if (usd < min) throw new HttpError(400, `This basket's minimum buy is $${min}.`);
    if (usd > RULES.maxBuyUsd) throw new HttpError(400, `The maximum buy is $${RULES.maxBuyUsd} for now.`);
    const result = await preflightBuy({
      weights,
      grossUsdc: BigInt(Math.floor(usd * 1e6)),
      creatorFeeBps,
      platformFeeBps: PLATFORM_FEE_BPS,
    });
    return Response.json({ minBuyUsd: min, ...result }, { headers: { "Cache-Control": "no-store" } });
  });
}
