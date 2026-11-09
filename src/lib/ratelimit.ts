// Per-instance sliding-window rate limit (spec §8). Serverless instances don't share memory, so this is a speed bump
// against loops and scripts, not a hard global limit.
import "server-only";
import { headers } from "next/headers";
import { HttpError } from "@/lib/auth/session";

const hits = new Map<string, number[]>();

export async function rateLimit(bucket: string, limit: number, windowMs: number, extraKey = "") {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
  const key = `${bucket}:${ip}:${extraKey}`;
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= limit) throw new HttpError(429, "Too many requests. Wait a moment and try again.");
  arr.push(now);
  hits.set(key, arr);
  if (hits.size > 10_000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
}
