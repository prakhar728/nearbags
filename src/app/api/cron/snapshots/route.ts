// Daily snapshot of every live basket's TVL and holders (Vercel Cron, Bearer CRON_SECRET).
import { inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { basketStats } from "@/lib/stats";

export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim(); // a stray newline in the env value made Vercel Cron get 401
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "unauthorized" }, { status: 401 });
  const baskets = await db().select({ id: schema.baskets.id }).from(schema.baskets).where(inArray(schema.baskets.status, ["live", "closed"]));
  let n = 0;
  for (const b of baskets) {
    const s = await basketStats(b.id);
    if (!s) continue;
    await db().insert(schema.snapshots).values({ basketId: b.id, tvlUsd: s.tvlUsd, holders: s.holders });
    n++;
  }
  return Response.json({ ok: true, snapshots: n });
}
