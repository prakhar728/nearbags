// Admin overview and actions (spec §8). Every action is written to the audit log. Admins can hide, never edit.
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { ASSETS } from "@/lib/assets";
import { requireAdmin } from "@/lib/auth/admin";
import { handle, HttpError } from "@/lib/auth/session";
import { getSettings, setSetting } from "@/lib/settings";

export async function GET() {
  return handle(async () => {
    await requireAdmin();
    const [settings, baskets, audit] = await Promise.all([
      getSettings(),
      db().select({ id: schema.baskets.id, slug: schema.baskets.slug, name: schema.baskets.name, status: schema.baskets.status, isHouse: schema.baskets.isHouse, hiddenReason: schema.baskets.hiddenReason }).from(schema.baskets).orderBy(desc(schema.baskets.id)),
      db().select().from(schema.auditLog).orderBy(desc(schema.auditLog.id)).limit(50),
    ]);
    return Response.json({ settings, baskets, audit, assets: ASSETS.map((a) => ({ id: a.id, name: a.name, kind: a.kind })), platformFeeBps: Number(process.env.PLATFORM_FEE_BPS ?? 25), platformFeeAccount: process.env.PLATFORM_FEE_ACCOUNT ?? null });
  });
}

const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("pause_buys"), paused: z.boolean() }),
  z.object({ action: z.literal("delist"), assetId: z.string(), delisted: z.boolean() }),
  z.object({ action: z.literal("hide_basket"), basketId: z.number().int(), hidden: z.boolean(), reason: z.string().max(200).optional() }),
]);

export async function POST(request: Request) {
  return handle(async () => {
    const { user } = await requireAdmin();
    const p = Action.safeParse(await request.json());
    if (!p.success) throw new HttpError(400, "Malformed admin action.");
    const a = p.data;
    if (a.action === "pause_buys") await setSetting("buysPaused", a.paused);
    if (a.action === "delist") {
      if (!ASSETS.some((x) => x.id === a.assetId)) throw new HttpError(400, "Unknown asset.");
      const cur = (await getSettings()).delisted;
      await setSetting("delisted", a.delisted ? [...new Set([...cur, a.assetId])] : cur.filter((x) => x !== a.assetId));
    }
    if (a.action === "hide_basket") {
      const [b] = await db().select().from(schema.baskets).where(eq(schema.baskets.id, a.basketId));
      if (!b) throw new HttpError(404, "Basket not found.");
      await db()
        .update(schema.baskets)
        .set(a.hidden ? { status: "hidden", hiddenReason: a.reason ?? null } : { status: b.closedAt ? "closed" : b.publishedAt ? "live" : "pending", hiddenReason: null })
        .where(eq(schema.baskets.id, a.basketId));
    }
    await db().insert(schema.auditLog).values({ actor: `admin:${user.walletAddress}`, action: a.action, target: "basketId" in a ? String(a.basketId) : "assetId" in a ? a.assetId : null, details: a });
    return Response.json({ ok: true, settings: await getSettings() });
  });
}
