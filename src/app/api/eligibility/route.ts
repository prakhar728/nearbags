// Eligibility for a basket from the visitor's country and their attestations (spec §8, compliance.ts).
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { getSession, handle, HttpError, requireSession } from "@/lib/auth/session";
import { getBasketById } from "@/lib/baskets";
import { ATTESTATION_TEXT, eligibility, type Attestation } from "@/lib/compliance";
import { visitorGeo } from "@/lib/geo";

export async function GET(request: Request) {
  return handle(async () => {
    const basketId = Number(new URL(request.url).searchParams.get("basketId"));
    const basket = await getBasketById(basketId);
    if (!basket) throw new HttpError(404, "Basket not found.");
    const s = await getSession();
    const attested = s ? ((await db().select().from(schema.users).where(eq(schema.users.id, s.userId)))[0]?.attestations ?? {}) : {};
    const e = eligibility({ ...(await visitorGeo()), assetIds: basket.assets.map((a) => a.assetId), attested });
    return Response.json({ ...e, text: Object.fromEntries(e.needs.map((n) => [n, ATTESTATION_TEXT[n]])) }, { headers: { "Cache-Control": "no-store" } });
  });
}

const Body = z.object({ items: z.array(z.enum(["risk", "not_us_person", "professional"])).min(1) });

export async function POST(request: Request) {
  return handle(async () => {
    const s = await requireSession();
    const p = Body.safeParse(await request.json());
    if (!p.success) throw new HttpError(400, "Malformed attestation.");
    const [u] = await db().select().from(schema.users).where(eq(schema.users.id, s.userId));
    const now = new Date().toISOString();
    const next = { ...u.attestations } as Record<Attestation, string>;
    for (const i of p.data.items) next[i] = now;
    await db()
      .update(schema.users)
      .set({ attestations: next, ...(p.data.items.includes("risk") ? { acceptedRiskAt: new Date() } : {}) })
      .where(eq(schema.users.id, s.userId));
    await db().insert(schema.auditLog).values({ actor: `user:${s.userId}`, action: "attest", target: p.data.items.join(","), details: { geo: await visitorGeo() } });
    return Response.json({ attestations: next });
  });
}
