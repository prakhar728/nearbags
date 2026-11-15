// One of your agent keys: change its trading settings, or revoke it (it stops working on the next request).
import { z } from "zod";
import { revokeKey } from "@/lib/agent-keys";
import { setTrading } from "@/lib/agent-trading";
import { handle, HttpError, requireSession } from "@/lib/auth/session";
import { sessionUser } from "@/lib/users";

const keyId = async (ctx: { params: Promise<{ id: string }> }) => {
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, "Bad key id.");
  return id;
};

export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await sessionUser(await requireSession());
    await revokeKey(user, await keyId(ctx));
    return Response.json({ ok: true });
  });
}

const Trading = z.object({ enabled: z.boolean(), dailyUsd: z.number(), anyBag: z.boolean(), basketIds: z.array(z.number().int()).max(50) });

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const s = await requireSession();
    const p = z.object({ trading: Trading }).safeParse(await request.json());
    if (!p.success) throw new HttpError(400, "Malformed request.");
    return Response.json({ trading: await setTrading(s.userId, await keyId(ctx), p.data.trading) });
  });
}
