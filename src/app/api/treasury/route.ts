// The signed-in creator's treasury setting: which of their positions is public, and whether fees go into it.
import { z } from "zod";
import { handle, HttpError, requireSession } from "@/lib/auth/session";
import { revalidateProfiles } from "@/lib/basket-pages";
import { setTreasury, treasurySettings } from "@/lib/treasury";

export async function GET() {
  return handle(async () => {
    const s = await requireSession();
    return Response.json(await treasurySettings(s.userId), { headers: { "Cache-Control": "no-store" } });
  });
}

const Body = z.object({ positionId: z.number().int().positive().nullable(), routeFees: z.boolean() });

export async function PUT(request: Request) {
  return handle(async () => {
    const s = await requireSession();
    const p = Body.safeParse(await request.json());
    if (!p.success) throw new HttpError(400, "Malformed request.");
    await setTreasury(s.userId, p.data);
    revalidateProfiles();
    return Response.json(await treasurySettings(s.userId));
  });
}
