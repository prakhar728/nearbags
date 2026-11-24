// GET /api/stats?ids=1,2,3 → on-chain stats per basket, from the shared 5-minute cache (lib/metrics), so calling this
// never reads the database per request.
import { handle, HttpError } from "@/lib/auth/session";
import { allMetrics } from "@/lib/metrics";

export async function GET(request: Request) {
  return handle(async () => {
    const ids = (new URL(request.url).searchParams.get("ids") ?? "").split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 50);
    if (!ids.length) throw new HttpError(400, "ids required.");
    const all = await allMetrics();
    const stats = ids
      .filter((id) => all[id])
      .map((id) => {
        const m = all[id];
        return { basketId: id, tvlUsd: m.tvlUsd, holders: m.holders, creatorHoldsUsd: m.creatorHoldsUsd, netInflow7dUsd: m.inflow7dUsd, buyers: m.buyers, volume30dUsd: m.volume30dUsd };
      });
    return Response.json({ stats }, { headers: { "Cache-Control": "public, max-age=60" } });
  });
}
