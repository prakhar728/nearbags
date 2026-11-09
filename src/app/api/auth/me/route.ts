import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { getSession, handle, HttpError, requireSession } from "@/lib/auth/session";

export async function GET() {
  return handle(async () => {
    const s = await getSession();
    if (!s) return Response.json({ user: null });
    const [u] = await db().select().from(schema.users).where(eq(schema.users.id, s.userId));
    if (!u) return Response.json({ user: null });
    const admins = (process.env.ADMIN_WALLETS ?? "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
    return Response.json({
      user: {
        id: u.id,
        chain: u.walletChain,
        address: u.walletAddress,
        walletPubkey: u.walletPubkey,
        handle: u.handle,
        keyMode: u.keyMode,
        isAdmin: u.isAdmin || admins.includes(u.walletAddress.toLowerCase()),
      },
    });
  });
}

// Record the outcome of the key-mode check (spec §4.2). Only set once per user.
const Patch = z.object({ keyMode: z.enum(["derived", "device"]) });

export async function PATCH(request: Request) {
  return handle(async () => {
    const s = await requireSession();
    const p = Patch.safeParse(await request.json());
    if (!p.success) throw new HttpError(400, "keyMode must be derived or device.");
    const [u] = await db().select().from(schema.users).where(eq(schema.users.id, s.userId));
    if (u.keyMode && u.keyMode !== p.data.keyMode) throw new HttpError(409, `Key mode is already ${u.keyMode}.`);
    await db().update(schema.users).set({ keyMode: p.data.keyMode }).where(eq(schema.users.id, s.userId));
    return Response.json({ keyMode: p.data.keyMode });
  });
}
