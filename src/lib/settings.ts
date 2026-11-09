// Runtime switches an admin can flip without a deploy (spec §8). The platform fee itself is PLATFORM_FEE_BPS (env).
import "server-only";
import { db, schema } from "@/db";

export interface Settings {
  buysPaused: boolean;
  delisted: string[]; // asset ids blocked for new buys; sells and withdrawals still work
}
const DEFAULTS: Settings = { buysPaused: false, delisted: [] };

let cache: { at: number; v: Settings } | null = null;

export async function getSettings(): Promise<Settings> {
  if (cache && Date.now() - cache.at < 15_000) return cache.v;
  const rows = await db().select().from(schema.settings);
  const v = { ...DEFAULTS };
  for (const r of rows) if (r.key in DEFAULTS) (v as Record<string, unknown>)[r.key] = r.value;
  cache = { at: Date.now(), v };
  return v;
}

export async function setSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
  await db().insert(schema.settings).values({ key, value }).onConflictDoUpdate({ target: schema.settings.key, set: { value } });
  cache = null;
}
