// A creator's agent keys (profile page). Session only: an agent key can't make or list keys.
import { z } from "zod";
import { createKey, listKeys } from "@/lib/agent-keys";
import { handle, HttpError, requireSession } from "@/lib/auth/session";
import { rateLimit } from "@/lib/ratelimit";
import { sessionUser } from "@/lib/users";

export async function GET() {
  return handle(async () => {
    const s = await requireSession();
    return Response.json({ keys: await listKeys(s.userId) }, { headers: { "Cache-Control": "private, no-store" } });
  });
}

const Body = z.object({ name: z.string().trim().min(1, "Name the key.").max(40, "Keep the name under 40 characters.") });

export async function POST(request: Request) {
  return handle(async () => {
    const user = await sessionUser(await requireSession());
    await rateLimit("agent-key", 10, 3600_000, String(user.id));
    const p = Body.safeParse(await request.json().catch(() => null));
    if (!p.success) throw new HttpError(400, p.error.issues[0]?.message ?? "Name the key.");
    const { key, view } = await createKey(user, p.data.name);
    return Response.json({ key, ...view }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  });
}
