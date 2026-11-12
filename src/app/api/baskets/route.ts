// Create a basket (spec §5.3). Normal creators get status "pending": it goes live after their self-buy
// (the trading track flips it). Admins may publish a House basket straight to "live" without a self-buy.
// The rules live in lib/creator/actions.ts, shared with the MCP server's agent keys.
import { handle, requireSession } from "@/lib/auth/session";
import { createBasket } from "@/lib/creator/actions";
import { sessionUser } from "@/lib/users";

export async function POST(request: Request) {
  return handle(async () => {
    const user = await sessionUser(await requireSession());
    const r = await createBasket(user, await request.json().catch(() => null), { allowHouse: true });
    return r.ok ? Response.json(r.value, { status: 201 }) : Response.json({ errors: r.errors }, { status: 400 });
  });
}
