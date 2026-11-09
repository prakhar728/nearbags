import { z } from "zod";
import { handle, HttpError, requireSession } from "@/lib/auth/session";
import type { SignedRawEd25519 } from "@/lib/intents/payload";
import { feeIntentsFor, submitFees } from "@/lib/trade/orders";

const Body = z.object({ signed: z.object({ standard: z.literal("raw_ed25519"), payload: z.string().max(8000), public_key: z.string(), signature: z.string() }) });

export async function GET(_req: Request, ctx: RouteContext<"/api/orders/[id]/fees">) {
  return handle(async () => {
    const s = await requireSession();
    return Response.json(await feeIntentsFor(s, Number((await ctx.params).id)));
  });
}

export async function POST(request: Request, ctx: RouteContext<"/api/orders/[id]/fees">) {
  return handle(async () => {
    const s = await requireSession();
    const p = Body.safeParse(await request.json());
    if (!p.success) throw new HttpError(400, "Malformed signature.");
    return Response.json(await submitFees(s, Number((await ctx.params).id), p.data.signed as SignedRawEd25519));
  });
}
