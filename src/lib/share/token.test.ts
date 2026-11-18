import { describe, expect, it, vi } from "vitest";
import { SignJWT } from "jose";
vi.mock("server-only", () => ({}));
import { readSnapshot, shareKey, signSnapshot, type PnlSnapshot } from "./token";
import { readSessionToken } from "@/lib/auth/session-token";

const SECRET = "s".repeat(48);
const snap: PnlSnapshot = { v: 1, slug: "ai-bag", name: "AI bag", assets: ["NVDA"], pct: 0.12, usd: null, days: 3, state: "open", by: "alice", at: "2026-11-18T00:00:00.000Z" };
const sessionKey = new TextEncoder().encode(SECRET);

describe("P&L share tokens", () => {
  it("new tokens round-trip with typ share and a derived key", async () => {
    const t = await signSnapshot(snap, SECRET);
    expect(await readSnapshot(t, SECRET)).toEqual(snap);
    const [h, p] = t.split(".").slice(0, 2).map((x) => JSON.parse(Buffer.from(x, "base64url").toString()));
    expect(h.typ).toBe("share");
    expect(p.typ).toBe("share");
    expect(Buffer.from(await shareKey(SECRET)).equals(Buffer.from(sessionKey))).toBe(false);
  });

  it("old tokens (SESSION_SECRET, typ stonkbag-pnl) still verify", async () => {
    const old = await new SignJWT({ ...snap }).setProtectedHeader({ alg: "HS256", typ: "stonkbag-pnl" }).setIssuedAt().sign(sessionKey);
    expect(await readSnapshot(old, SECRET)).toEqual(snap);
  });

  it("are never accepted as sessions, old or new", async () => {
    const old = await new SignJWT({ ...snap }).setProtectedHeader({ alg: "HS256", typ: "stonkbag-pnl" }).setIssuedAt().sign(sessionKey);
    expect(await readSessionToken(old, sessionKey)).toBeNull();
    expect(await readSessionToken(await signSnapshot(snap, SECRET), sessionKey)).toBeNull();
  });

  it("refuses tokens with the wrong typ or key", async () => {
    const noTyp = await new SignJWT({ ...snap }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().sign(sessionKey);
    expect(await readSnapshot(noTyp, SECRET)).toBeNull();
    const shareTypOnSessionKey = await new SignJWT({ ...snap, typ: "share" }).setProtectedHeader({ alg: "HS256", typ: "share" }).sign(sessionKey);
    expect(await readSnapshot(shareTypOnSessionKey, SECRET)).toBeNull();
    expect(await readSnapshot(await signSnapshot(snap, SECRET), "t".repeat(48))).toBeNull();
    expect(await readSnapshot("garbage", SECRET)).toBeNull();
  });
});
