// Vercel Cron auth: `Authorization: Bearer $CRON_SECRET`, compared in constant time (security audit 2026-11-18).
import { timingSafeEqual } from "node:crypto";

/** Constant-time string compare. Different lengths are refused (timingSafeEqual needs equal-length buffers). */
export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  if (x.length !== y.length) return false;
  return timingSafeEqual(x, y);
}

/** True when the request carries the cron secret. A missing CRON_SECRET refuses everything. */
export function cronAuthorized(request: Request, secret = process.env.CRON_SECRET?.trim()): boolean {
  // .trim(): a stray newline in the env value made Vercel Cron get 401.
  if (!secret) return false;
  return safeEqual(request.headers.get("authorization") ?? "", `Bearer ${secret}`);
}
