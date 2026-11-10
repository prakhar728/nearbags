// Daily agent run for every live agent-managed basket, then continue any unfinished rebalances.
// Called by Vercel Cron with `Authorization: Bearer $CRON_SECRET`.
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { pumpAll, runAgent } from "@/lib/agent/run";

export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const baskets = await db().select({ id: schema.baskets.id }).from(schema.baskets).where(and(eq(schema.baskets.status, "live"), isNotNull(schema.baskets.agent)));
  const started: number[] = [];
  const errors: string[] = [];
  for (const b of baskets) {
    const [last] = await db().select().from(schema.agentRuns).where(eq(schema.agentRuns.basketId, b.id)).orderBy(desc(schema.agentRuns.createdAt)).limit(1);
    if (last && Date.now() - last.createdAt.getTime() < 20 * 3600_000) continue;
    try {
      started.push(await runAgent(b.id, "cron"));
    } catch (e) {
      errors.push(`basket ${b.id}: ${(e as Error).message.slice(0, 160)}`);
    }
  }
  await pumpAll(60_000);
  return Response.json({ ok: true, started, errors });
}
