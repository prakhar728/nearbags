import { clearSession, handle } from "@/lib/auth/session";

export async function POST() {
  return handle(async () => {
    await clearSession();
    return Response.json({ ok: true });
  });
}
