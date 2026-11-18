import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { isAdminUser } from "@/lib/auth/admin-match";
import { handle, HttpError, requireSession, type Session } from "@/lib/auth/session";

export async function GET() {
  return handle(async () => {
    // Checked against session_version, so a logged-out token reads as signed out here too.
    let s: Session;
    try {
      s = await requireSession();
    } catch (e) {
      if (e instanceof HttpError && e.status === 401) return Response.json({ user: null });
      throw e;
    }
    const [u] = await db().select().from(schema.users).where(eq(schema.users.id, s.userId));
    if (!u) return Response.json({ user: null });
    return Response.json({
      user: {
        id: u.id,
        chain: u.walletChain,
        address: u.walletAddress,
        walletPubkey: u.walletPubkey,
        handle: u.handle,
        keyMode: u.keyMode,
        isAdmin: isAdminUser(u),
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
    // New wallets start on device keys only (security re-audit N1); derived stays for wallets that already use it.
    if (!u.keyMode && p.data.keyMode !== "device") {
      // ...unless this wallet already holds derived accounts (an older setup that never saved its mode).
      const [derived] = await db().select({ id: schema.positions.id }).from(schema.positions).where(and(eq(schema.positions.userId, s.userId), eq(schema.positions.keyMode, "derived"))).limit(1);
      if (!derived) throw new HttpError(400, "New wallets use device keys.");
    }
    await db().update(schema.users).set({ keyMode: p.data.keyMode }).where(eq(schema.users.id, s.userId));
    return Response.json({ keyMode: p.data.keyMode });
  });
}
