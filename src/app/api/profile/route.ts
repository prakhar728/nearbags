// Own creator profile (spec §5.8): handle (unique, 3–20, a–z 0–9 _), bio (≤160), optional X link (unverified).
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { handle, HttpError, requireSession } from "@/lib/auth/session";
import { revalidateProfiles, TAG_BASKETS } from "@/lib/basket-pages";
import { profileProblems } from "@/lib/profile-rules";
import { isAdmin, sessionUser, type UserRow } from "@/lib/users";
import { revalidateTag } from "next/cache";

const view = (u: UserRow) => ({ handle: u.handle, bio: u.bio, xUrl: u.xUrl, address: u.walletAddress, chain: u.walletChain });

export async function GET() {
  return handle(async () => {
    const u = await sessionUser(await requireSession());
    return Response.json({ profile: view(u) });
  });
}

export async function PATCH(request: Request) {
  return handle(async () => {
    const u = await sessionUser(await requireSession());
    const { errors, data } = profileProblems(await request.json().catch(() => null), { admin: isAdmin(u) });
    if (!data) return Response.json({ errors }, { status: 400 });

    const set: Partial<Pick<UserRow, "handle" | "bio" | "xUrl">> = {};
    if (data.handle !== undefined && data.handle !== u.handle) {
      const [taken] = await db().select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.handle, data.handle));
      if (taken && taken.id !== u.id) throw new HttpError(409, "That handle is taken.");
      set.handle = data.handle;
    }
    if (data.bio !== undefined) set.bio = data.bio;
    if (data.xUrl !== undefined) set.xUrl = data.xUrl;
    if (!Object.keys(set).length) return Response.json({ profile: view(u) });

    try {
      const [row] = await db().update(schema.users).set(set).where(eq(schema.users.id, u.id)).returning();
      revalidateProfiles();
      if (set.handle !== undefined) revalidateTag(TAG_BASKETS, { expire: 0 }); // cards and basket pages show the handle
      return Response.json({ profile: view(row) });
    } catch (e) {
      const err = e as { code?: string; cause?: { code?: string } };
      if ((err.code ?? err.cause?.code) === "23505") throw new HttpError(409, "That handle is taken.");
      throw e;
    }
  });
}
