// Admin Stats tab: raw rows from the shared 5-minute cache (src/lib/admin-stats.ts). Admins only.
import { requireAdmin } from "@/lib/auth/admin";
import { handle } from "@/lib/auth/session";
import { getAdminStats } from "@/lib/admin-stats";

export async function GET() {
  return handle(async () => {
    await requireAdmin();
    return Response.json(await getAdminStats(), { headers: { "Cache-Control": "private, no-store" } });
  });
}
