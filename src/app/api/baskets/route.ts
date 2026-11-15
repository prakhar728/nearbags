// Create a basket (spec §5.3). Normal creators get status "pending": it goes live after their self-buy
// (the trading track flips it). Admins may publish a House basket straight to "live" without a self-buy.
// The rules live in lib/creator/actions.ts, shared with the MCP server's agent keys.
import { handle, requireSession } from "@/lib/auth/session";
import { listExploreBaskets } from "@/lib/basket-pages";
import { createBasket } from "@/lib/creator/actions";
import { sessionUser } from "@/lib/users";

export async function POST(request: Request) {
  return handle(async () => {
    const user = await sessionUser(await requireSession());
    const r = await createBasket(user, await request.json().catch(() => null), { allowHouse: true });
    return r.ok ? Response.json(r.value, { status: 201 }) : Response.json({ errors: r.errors }, { status: 400 });
  });
}

/** Live bags in brief (id, slug, name), e.g. for choosing which bags an agent key may trade. Cached like Explore. */
export async function GET() {
  return handle(async () => {
    const list = (await listExploreBaskets()).filter((b) => b.status === "live").map((b) => ({ id: b.id, slug: b.slug, name: b.name }));
    return Response.json({ baskets: list }, { headers: { "Cache-Control": "public, max-age=60, s-maxage=300" } });
  });
}
