// Rate limits and caps shared by every server instance (security audit 2026-11-18: the old in-memory limiter counted
// per instance, so serverless scale-out multiplied every limit). Fixed windows in Postgres: one upsert per check.
import "server-only";
import { headers } from "next/headers";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { HttpError } from "@/lib/auth/session";

/** The caller's IP as Vercel reports it ("local" in dev). */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}

/**
 * Count one hit for `key` in the current window and return the count, including this hit. A new window starts once
 * the old one is `windowMs` old.
 */
export async function hit(key: string, windowMs: number, n = 1): Promise<number> {
  const rows = await db().execute<{ hits: number }>(sql`
    INSERT INTO rate_limits (key, window_start, hits) VALUES (${key}, now(), ${n})
    ON CONFLICT (key) DO UPDATE SET
      hits = CASE WHEN rate_limits.window_start < now() - make_interval(secs => ${windowMs / 1000}) THEN ${n} ELSE rate_limits.hits + ${n} END,
      window_start = CASE WHEN rate_limits.window_start < now() - make_interval(secs => ${windowMs / 1000}) THEN now() ELSE rate_limits.window_start END
    RETURNING hits`);
  return Number(rows[0]?.hits ?? n);
}

/** Refuse with 429 once `limit` hits land in the window. Keyed by IP, plus `extraKey` (user or key id) when given. */
export async function rateLimit(bucket: string, limit: number, windowMs: number, extraKey = "", n = 1) {
  const key = extraKey ? `${bucket}:${extraKey}` : `${bucket}:ip:${await clientIp()}`;
  if ((await hit(key, windowMs, n)) > limit) throw new HttpError(429, "Too many requests. Wait a moment and try again.");
}

/** A hard cap (not a speed bump): refuse with `message` once `key` has been counted `limit` times in the window. */
export async function cap(key: string, limit: number, windowMs: number, message: string) {
  if ((await hit(key, windowMs)) > limit) throw new HttpError(429, message);
}

/** Old rows, for the daily cron. */
export async function pruneRateLimits() {
  await db().execute(sql`DELETE FROM rate_limits WHERE window_start < now() - interval '400 days'`);
  await db().execute(sql`DELETE FROM leases WHERE until < now() - interval '1 day'`);
}
