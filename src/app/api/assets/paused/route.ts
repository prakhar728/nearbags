// Which approved assets can't be bought or sold right now, for the bag builder. Same check as the buy button and the
// explore notice (lib/trade/availability.ts, cached 10 minutes per server); the CDN keeps a copy for 5 minutes.
import { connection } from "next/server";
import { handle } from "@/lib/auth/session";
import { pausedAcrossList } from "@/lib/trade/availability";

export async function GET() {
  return handle(async () => {
    await connection();
    const p = await pausedAcrossList();
    return Response.json(p, { headers: { "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600" } });
  });
}
