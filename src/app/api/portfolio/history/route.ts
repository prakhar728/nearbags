import { handle, requireSession } from "@/lib/auth/session";
import { history } from "@/lib/trade/history";

export async function GET() {
  return handle(async () => {
    const s = await requireSession();
    return Response.json(await history(s.userId), { headers: { "Cache-Control": "no-store" } });
  });
}
