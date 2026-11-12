// Revoke one of your agent keys. It stops working on the next request.
import { revokeKey } from "@/lib/agent-keys";
import { handle, HttpError, requireSession } from "@/lib/auth/session";
import { sessionUser } from "@/lib/users";

export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await sessionUser(await requireSession());
    const id = Number((await ctx.params).id);
    if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, "Bad key id.");
    await revokeKey(user, id);
    return Response.json({ ok: true });
  });
}
