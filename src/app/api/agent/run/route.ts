// "Run now": the basket's creator (or an admin) starts an agent run. runAgent (shared with the MCP's run_agent and the
// cron) holds one lease per basket, allows one run per 10 minutes, and caps a creator's runs at RUNS_PER_DAY a day.
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { handle, HttpError, requireSession } from "@/lib/auth/session";
import { isAdminUser } from "@/lib/auth/admin-match";
import { agentRunsFor, runAgent } from "@/lib/agent/run";

export const maxDuration = 300;

const Body = z.object({ basketId: z.number().int().positive() });

export async function POST(request: Request) {
  return handle(async () => {
    const s = await requireSession();
    const p = Body.safeParse(await request.json());
    if (!p.success) throw new HttpError(400, "Malformed request.");
    const [basket] = await db().select().from(schema.baskets).where(eq(schema.baskets.id, p.data.basketId));
    if (!basket) throw new HttpError(404, "Basket not found.");
    const [u] = await db().select().from(schema.users).where(eq(schema.users.id, s.userId));
    const admin = isAdminUser(u);
    if (basket.creatorId !== s.userId && !admin) throw new HttpError(403, "Only the basket's creator can run its agent.");
    const runId = await runAgent(basket.id, basket.creatorId === s.userId ? "creator" : "admin");
    const [run] = (await agentRunsFor(basket.id, 1)).filter((r) => r.id === runId);
    return Response.json({ run });
  });
}
