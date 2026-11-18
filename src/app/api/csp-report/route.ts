// Collects Content-Security-Policy-Report-Only violations (next.config.ts) so the strict policy can be switched on once
// real wallet use shows no violations. Logged, not stored; size- and rate-limited.
import { rateLimit } from "@/lib/ratelimit";

export async function POST(request: Request) {
  try {
    await rateLimit("csp", 30, 60_000);
    const text = (await request.text()).slice(0, 4000);
    const j = JSON.parse(text) as { "csp-report"?: Record<string, unknown> };
    const r = j["csp-report"] ?? {};
    console.warn("csp-report", JSON.stringify({ directive: r["violated-directive"], blocked: r["blocked-uri"], page: r["document-uri"], source: r["source-file"] }));
  } catch {
    // ignore malformed or rate-limited reports
  }
  return new Response(null, { status: 204 });
}
