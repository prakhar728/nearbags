// Proxy (Next 16's name for middleware). CSRF guard for the API (security audit 2026-11-18, item 2): a POST, PUT, PATCH
// or DELETE under /api/ must carry an Origin header naming this host or one of our production hosts. The session cookie
// is SameSite=Lax, which already stops most cross-site posts; this closes the rest (same-site subdomains, old browsers).
// Exempt: /api/mcp (bearer-key auth, open CORS by design) and /api/cron (Vercel Cron, bearer secret).
// The matcher covers /api/ only, so pages, static assets, /sw.js and Server Actions never reach this.
import { NextResponse, type NextRequest } from "next/server";
import { originAllowed } from "@/lib/auth/hosts";

const UNSAFE = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const EXEMPT = /^\/api\/(mcp|cron|csp-report)(\/|$)/; // csp-report: browsers may send violation reports without an Origin

export function proxy(request: NextRequest) {
  if (!UNSAFE.has(request.method) || EXEMPT.test(request.nextUrl.pathname)) return NextResponse.next();
  const host = request.headers.get("host") ?? request.nextUrl.host;
  if (!originAllowed(request.headers.get("origin"), host)) {
    return NextResponse.json({ error: "Cross-site request refused." }, { status: 403 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
