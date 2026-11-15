// Claim a gift (anyone but the sender) or take it back (the sender): first ask for the exact intents to sign (no
// `signed`), then send them signed. Every check runs again on submit, and the relay simulates before executing.
import { z } from "zod";
import { handle, HttpError, requireSession } from "@/lib/auth/session";
import { prepareTransfer, submitTransfer } from "@/lib/gifts";
import type { SignedIntent } from "@/lib/intents/wallet-sign";
import { rateLimit } from "@/lib/ratelimit";

const Body = z.object({
  mode: z.enum(["claim", "reclaim"]),
  receiver: z.string().regex(/^[0-9a-f]{64}$/),
  signed: z
    .union([
      z.object({ standard: z.literal("raw_ed25519"), payload: z.string().max(4000), public_key: z.string().max(100), signature: z.string().max(200) }),
      z.object({ standard: z.literal("erc191"), payload: z.string().max(4000), signature: z.string().max(200) }),
      z.object({
        standard: z.literal("nep413"),
        payload: z.object({ message: z.string().max(4000), nonce: z.string().max(64), recipient: z.string().max(64) }),
        public_key: z.string().max(100),
        signature: z.string().max(200),
      }),
    ])
    .optional(),
});

export async function POST(request: Request, ctx: RouteContext<"/api/gifts/[code]/transfer">) {
  return handle(async () => {
    const s = await requireSession();
    await rateLimit("gift-transfer", 20, 60_000, String(s.userId));
    const { code } = await ctx.params;
    const p = Body.safeParse(await request.json());
    if (!p.success) throw new HttpError(400, "Malformed request.");
    if (!p.data.signed) {
      const { accountId, intents } = await prepareTransfer(code, s.userId, p.data.mode, p.data.receiver);
      return Response.json({ accountId, intents });
    }
    return Response.json(await submitTransfer(code, s.userId, p.data.mode, p.data.receiver, p.data.signed as SignedIntent));
  });
}
