// Gifts: register a new one (the browser made its key) and list the ones you sent.
import { z } from "zod";
import { handle, HttpError, requireSession } from "@/lib/auth/session";
import { createGift, sentGifts } from "@/lib/gifts";
import { rateLimit } from "@/lib/ratelimit";
import { proofProblem } from "@/lib/intents/proof";
import type { SignedRawEd25519 } from "@/lib/intents/payload";

const Body = z.object({
  basketId: z.number().int().positive(),
  accountId: z.string(),
  message: z.string().max(400).nullable(),
  days: z.number(),
  // Signed by the gift account's own key (see lib/intents/proof.ts).
  proof: z.object({ standard: z.literal("raw_ed25519"), payload: z.string().max(2000), public_key: z.string(), signature: z.string() }),
});

export async function POST(request: Request) {
  return handle(async () => {
    const s = await requireSession();
    await rateLimit("gift", 10, 3600_000, String(s.userId));
    const p = Body.safeParse(await request.json());
    if (!p.success) throw new HttpError(400, "Malformed gift.");
    const why = proofProblem(p.data.proof as SignedRawEd25519, p.data.accountId);
    if (why) throw new HttpError(403, `Can't register this gift account: ${why}.`);
    return Response.json(await createGift(s.userId, p.data));
  });
}

export async function GET() {
  return handle(async () => {
    const s = await requireSession();
    return Response.json({ gifts: await sentGifts(s.userId) }, { headers: { "Cache-Control": "no-store" } });
  });
}
