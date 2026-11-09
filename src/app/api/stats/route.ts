// GET /api/stats?ids=1,2,3 → on-chain stats per basket (cached 5 min server-side).
import { handle, HttpError } from "@/lib/auth/session";
import { basketStats } from "@/lib/stats";

export async function GET(request: Request) {
  return handle(async () => {
    const ids = (new URL(request.url).searchParams.get("ids") ?? "").split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 50);
    if (!ids.length) throw new HttpError(400, "ids required.");
    const stats = await Promise.all(ids.map((id) => basketStats(id)));
    return Response.json({ stats: stats.filter(Boolean) }, { headers: { "Cache-Control": "public, max-age=60" } });
  });
}
