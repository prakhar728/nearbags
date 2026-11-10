// A basket's recent agent runs, for its page. Public: decisions, reasons and proof links, never the strategy.
import { handle, HttpError } from "@/lib/auth/session";
import { agentRunsFor } from "@/lib/agent/run";

export async function GET(request: Request) {
  return handle(async () => {
    const id = Number(new URL(request.url).searchParams.get("basketId"));
    if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, "basketId is required.");
    return Response.json({ runs: await agentRunsFor(id) });
  });
}
