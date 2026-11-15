// Gifts: register a new one (the browser made its key) and list the ones you sent.
import { z } from "zod";
import { handle, HttpError, requireSession } from "@/lib/auth/session";
import { createGift, sentGifts } from "@/lib/gifts";
import { rateLimit } from "@/lib/ratelimit";

const Body = z.object({ basketId: z.number().int().positive(), accountId: z.string(), message: z.string().max(400).nullable(), days: z.number() });

export async function POST(request: Request) {
  return handle(async () => {
    const s = await requireSession();
    await rateLimit("gift", 10, 3600_000, String(s.userId));
    const p = Body.safeParse(await request.json());
    if (!p.success) throw new HttpError(400, "Malformed gift.");
    return Response.json(await createGift(s.userId, p.data));
  });
}

export async function GET() {
  return handle(async () => {
    const s = await requireSession();
    return Response.json({ gifts: await sentGifts(s.userId) }, { headers: { "Cache-Control": "no-store" } });
  });
}
