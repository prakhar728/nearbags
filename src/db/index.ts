// One driver everywhere: postgres.js talks to local Postgres in dev and Neon (TLS) in production.
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

function makeDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  const client = postgres(url, {
    ssl: isLocal ? false : "require",
    max: isLocal ? 10 : 3, // serverless: keep pools small
    prepare: false, // required for Neon's pooled (pgbouncer) endpoint
    onnotice: () => {},
  });
  return drizzle(client, { schema });
}

type Db = ReturnType<typeof makeDb>;
const g = globalThis as unknown as { __nearbagsDb?: Db };

// Lazily created and reused across hot reloads in dev.
export function db(): Db {
  g.__nearbagsDb ??= makeDb();
  return g.__nearbagsDb;
}

export { schema };
