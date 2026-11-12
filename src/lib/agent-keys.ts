// Agent keys: a creator makes one on their profile and gives it to an AI agent, which sends it to the MCP server as
// "Authorization: Bearer nbk_...". The key can manage that creator's baskets (create, edit, close, run its agent)
// and nothing else: it can't buy, sell, withdraw or sign anything. Only a SHA-256 of the key is stored.
import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, count, desc, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { HttpError } from "@/lib/auth/session";
import type { UserRow } from "@/lib/users";

export const KEY_PREFIX = "nbk_";
export const MAX_ACTIVE_KEYS = 5;
/** What a key may do. Only "bags" exists today; trading would be a separate scope the owner opts into. */
export const SCOPES = ["bags"] as const;
export type Scope = (typeof SCOPES)[number];

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export interface AgentKeyView {
  id: number;
  name: string;
  prefix: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
}

const view = (k: typeof schema.agentKeys.$inferSelect): AgentKeyView => ({
  id: k.id,
  name: k.name,
  prefix: k.prefix,
  scopes: k.scopes,
  createdAt: k.createdAt.toISOString(),
  lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
});

export async function listKeys(userId: number): Promise<AgentKeyView[]> {
  const rows = await db()
    .select()
    .from(schema.agentKeys)
    .where(and(eq(schema.agentKeys.userId, userId), isNull(schema.agentKeys.revokedAt)))
    .orderBy(desc(schema.agentKeys.id));
  return rows.map(view);
}

/** Make a key. The full key is returned once and never stored. */
export async function createKey(user: UserRow, name: string): Promise<{ key: string; view: AgentKeyView }> {
  // Same bar as buying: the owner has accepted the risks on the site.
  if (!user.acceptedRiskAt) throw new HttpError(403, "Accept the risk notice on the site first (it shows before your first buy).");
  const [{ n }] = await db()
    .select({ n: count() })
    .from(schema.agentKeys)
    .where(and(eq(schema.agentKeys.userId, user.id), isNull(schema.agentKeys.revokedAt)));
  if (n >= MAX_ACTIVE_KEYS) throw new HttpError(409, `You can have ${MAX_ACTIVE_KEYS} agent keys. Revoke one first.`);
  const key = KEY_PREFIX + randomBytes(32).toString("base64url");
  const [row] = await db()
    .insert(schema.agentKeys)
    .values({ userId: user.id, name, prefix: key.slice(0, 12), hash: sha256(key), scopes: [...SCOPES] })
    .returning();
  await audit(user, row.prefix, "agent_key.create", null, { name });
  return { key, view: view(row) };
}

export async function revokeKey(user: UserRow, id: number) {
  const [row] = await db()
    .update(schema.agentKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(schema.agentKeys.id, id), eq(schema.agentKeys.userId, user.id), isNull(schema.agentKeys.revokedAt)))
    .returning();
  if (!row) throw new HttpError(404, "No such key.");
  await audit(user, row.prefix, "agent_key.revoke", null, { name: row.name });
}

export interface AgentActor {
  user: UserRow;
  keyId: number;
  keyName: string;
  prefix: string;
  scopes: Scope[];
}

/**
 * The owner behind a bearer key, or null if it's unknown or revoked. A banned or hidden owner isn't a thing yet;
 * revoking the key is how access ends.
 */
export async function resolveKey(key: string): Promise<AgentActor | null> {
  if (!key.startsWith(KEY_PREFIX) || key.length > 100) return null;
  const [row] = await db()
    .select({ k: schema.agentKeys, u: schema.users })
    .from(schema.agentKeys)
    .innerJoin(schema.users, eq(schema.users.id, schema.agentKeys.userId))
    .where(and(eq(schema.agentKeys.hash, sha256(key)), isNull(schema.agentKeys.revokedAt)))
    .limit(1);
  if (!row) return null;
  // Note when it was last used, at most every 10 minutes, so a busy agent doesn't write on every call.
  if (!row.k.lastUsedAt || Date.now() - row.k.lastUsedAt.getTime() > 10 * 60_000) {
    await db().update(schema.agentKeys).set({ lastUsedAt: new Date() }).where(eq(schema.agentKeys.id, row.k.id)).catch(() => {});
  }
  return { user: row.u, keyId: row.k.id, keyName: row.k.name, prefix: row.k.prefix, scopes: row.k.scopes.filter((s): s is Scope => (SCOPES as readonly string[]).includes(s)) };
}

/** Every change made with a key goes to the audit log, named by the key so the owner can see what their agent did. */
export async function audit(user: UserRow, prefix: string, action: string, target: string | null, details: unknown) {
  await db()
    .insert(schema.auditLog)
    .values({ actor: `agent:${user.walletAddress}:${prefix}`, action, target, details: details as object })
    .catch((e) => console.error("[audit]", e));
}
