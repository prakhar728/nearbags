// Analytics for unsaved weights (creator studio live preview). Validates with the same rules as publish.
import { z } from "zod";
import { getAnalyticsView } from "@/lib/analytics/cached";
import { handle, HttpError } from "@/lib/auth/session";
import { minBuyUsd, RULES, validateWeights } from "@/lib/basket-rules";
import { platformFeeBpsFor } from "@/lib/baskets";

const Body = z.object({
  weights: z.array(z.object({ assetId: z.string().max(16), weightBps: z.number().int() })).max(20),
  feeBps: z.number().int().min(0).max(RULES.maxCreatorFeeBps).optional(),
  agent: z.boolean().optional(),
});

export async function POST(request: Request) {
  return handle(async () => {
    const p = Body.safeParse(await request.json().catch(() => null));
    if (!p.success) throw new HttpError(400, "Send { weights: [{ assetId, weightBps }] }.");
    const weights = p.data.weights.map(({ assetId, weightBps }) => ({ assetId, weightBps }));
    const errors = validateWeights(weights);
    if (errors.length) return Response.json({ errors }, { status: 400 });
    const feeBps = p.data.feeBps ?? 50;
    const analytics = await getAnalyticsView(weights);
    if ("error" in analytics) return Response.json({ errors: [analytics.error] }, { status: 422 });
    return Response.json({ analytics, minBuyUsd: minBuyUsd(weights, feeBps + platformFeeBpsFor(Boolean(p.data.agent))) });
  });
}
