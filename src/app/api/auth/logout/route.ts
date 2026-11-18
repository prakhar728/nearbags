import { clearSession, handle } from "@/lib/auth/session";

// Ends every session this user holds (session_version bump), not just this browser's cookie.
export async function POST() {
  return handle(async () => {
    await clearSession();
    return Response.json({ ok: true });
  });
}
