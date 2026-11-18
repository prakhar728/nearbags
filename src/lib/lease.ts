// "Only one at a time" across server instances, without holding a database connection or transaction open while the
// work runs (a long transaction per request would exhaust the small serverless pool). A lease expires on its own, so
// a crashed request can't block the key forever.
import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { HttpError } from "@/lib/auth/session";

/** Take the lease, or return false if someone else holds an unexpired one. */
export async function acquire(key: string, ttlMs: number): Promise<boolean> {
  const rows = await db().execute(sql`
    INSERT INTO leases (key, until) VALUES (${key}, now() + make_interval(secs => ${ttlMs / 1000}))
    ON CONFLICT (key) DO UPDATE SET until = excluded.until WHERE leases.until < now()
    RETURNING key`);
  return rows.length > 0;
}

export async function release(key: string) {
  await db().execute(sql`DELETE FROM leases WHERE key = ${key}`);
}

/** Run `fn` holding the lease; refuse with 409 `busy` if it's taken. */
export async function withLease<T>(key: string, ttlMs: number, busy: string, fn: () => Promise<T>): Promise<T> {
  if (!(await acquire(key, ttlMs))) throw new HttpError(409, busy);
  try {
    return await fn();
  } finally {
    await release(key).catch(() => {});
  }
}
