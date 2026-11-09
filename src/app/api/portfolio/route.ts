import { handle, requireSession } from "@/lib/auth/session";
import { portfolio } from "@/lib/trade/portfolio";

export async function GET() {
  return handle(async () => {
    const s = await requireSession();
    return Response.json({ positions: await portfolio(s.userId) }, { headers: { "Cache-Control": "no-store" } });
  });
}
