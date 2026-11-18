// "Only one at a time" across server instances, without holding a database connection or transaction open while the
// work runs (a long transaction per request would exhaust the small serverless pool). A lease expires on its own, so
// a crashed request can't block the key forever. Each holder gets a random owner token, so a request that outlived its
// lease can't release the next holder's.
import "server-only";
import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { HttpError } from "@/lib/auth/session";

/** Take the lease: returns the owner token, or null if someone else holds an unexpired one. */
export async function acquire(key: string, ttlMs: number): Promise<string | null> {
  const owner = randomBytes(16).toString("hex");
  const rows = await db().execute(sql`
    INSERT INTO leases (key, until, owner) VALUES (${key}, now() + make_interval(secs => ${ttlMs / 1000}), ${owner})
    ON CONFLICT (key) DO UPDATE SET until = excluded.until, owner = excluded.owner WHERE leases.until < now()
    RETURNING key`);
  return rows.length > 0 ? owner : null;
}

export async function release(key: string, owner: string) {
  await db().execute(sql`DELETE FROM leases WHERE key = ${key} AND owner = ${owner}`);
}

/** Run `fn` holding the lease; refuse with 409 `busy` if it's taken. */
export async function withLease<T>(key: string, ttlMs: number, busy: string, fn: () => Promise<T>): Promise<T> {
  const owner = await acquire(key, ttlMs);
  if (!owner) throw new HttpError(409, busy);
  try {
    return await fn();
  } finally {
    await release(key, owner).catch(() => {});
  }
}
