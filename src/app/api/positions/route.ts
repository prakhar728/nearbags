// Register a basket position for the signed-in user (spec §4.1). The browser derives/creates the basket key and
// sends only the public account id. One position per (user, basket).
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { handle, HttpError, requireSession } from "@/lib/auth/session";
import { isImplicitAccount } from "@/lib/intents/keys";
import { proofProblem } from "@/lib/intents/proof";
import type { SignedRawEd25519 } from "@/lib/intents/payload";

const Body = z.object({
  basketId: z.number().int().positive(),
  accountId: z.string(),
  keyMode: z.enum(["derived", "device"]),
  // Signed by the account's own key: you can only register an account you control.
  proof: z.object({ standard: z.literal("raw_ed25519"), payload: z.string().max(2000), public_key: z.string(), signature: z.string() }),
});

export async function POST(request: Request) {
  return handle(async () => {
    const s = await requireSession();
    const p = Body.safeParse(await request.json());
    if (!p.success || !isImplicitAccount(p.data.accountId)) throw new HttpError(400, "Malformed position.");
    const { basketId, accountId, keyMode } = p.data;
    const why = proofProblem(p.data.proof as SignedRawEd25519, accountId);
    if (why) throw new HttpError(403, `Can't register this account: ${why}.`);

    const [basket] = await db().select().from(schema.baskets).where(eq(schema.baskets.id, basketId));
    if (!basket) throw new HttpError(404, "Basket not found.");

    const [existing] = await db()
      .select()
      .from(schema.positions)
      .where(and(eq(schema.positions.userId, s.userId), eq(schema.positions.basketId, basketId), eq(schema.positions.kind, "own")));
    if (existing) {
      if (existing.accountId !== accountId) throw new HttpError(409, "This basket already has a different account for you. Restore your keys first.");
      return Response.json({ position: existing });
    }
    const [created] = await db().insert(schema.positions).values({ userId: s.userId, basketId, accountId, keyMode }).returning();
    return Response.json({ position: created });
  });
}

export async function GET() {
  return handle(async () => {
    const s = await requireSession();
    const rows = await db().select().from(schema.positions).where(and(eq(schema.positions.userId, s.userId), eq(schema.positions.kind, "own")));
    return Response.json({ positions: rows });
  });
}
