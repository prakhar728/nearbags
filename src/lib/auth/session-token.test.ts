import { describe, expect, it } from "vitest";
import { SignJWT } from "jose";
import { readSessionToken, signSessionToken } from "./session-token";

const key = new TextEncoder().encode("k".repeat(40));
const claims = { userId: 7, chain: "near" as const, address: "alice.near", sv: 3 };

describe("session tokens", () => {
  it("round-trips", async () => {
    expect(await readSessionToken(await signSessionToken(claims, key, 60), key)).toEqual(claims);
  });

  it("refuses tokens without typ session, audience or sv (old sessions, share tokens)", async () => {
    const old = await new SignJWT({ userId: 7, chain: "near", address: "alice.near" }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("1h").sign(key);
    expect(await readSessionToken(old, key)).toBeNull();
    const share = await new SignJWT({ v: 1, slug: "x", typ: "share" }).setProtectedHeader({ alg: "HS256", typ: "share" }).setAudience("nearbags:session").setIssuedAt().setExpirationTime("1h").sign(key);
    expect(await readSessionToken(share, key)).toBeNull();
    const legacyShare = await new SignJWT({ v: 1, slug: "x" }).setProtectedHeader({ alg: "HS256", typ: "stonkbag-pnl" }).setIssuedAt().sign(key);
    expect(await readSessionToken(legacyShare, key)).toBeNull();
    const noAud = await new SignJWT({ ...claims, typ: "session" }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("1h").sign(key);
    expect(await readSessionToken(noAud, key)).toBeNull();
    const noSv = await new SignJWT({ userId: 7, chain: "near", address: "alice.near", typ: "session" }).setProtectedHeader({ alg: "HS256" }).setAudience("nearbags:session").setIssuedAt().setExpirationTime("1h").sign(key);
    expect(await readSessionToken(noSv, key)).toBeNull();
  });

  it("requires an integer userId", async () => {
    for (const userId of ["7", 7.5, null, -1]) {
      const t = await new SignJWT({ ...claims, userId, typ: "session" }).setProtectedHeader({ alg: "HS256" }).setAudience("nearbags:session").setIssuedAt().setExpirationTime("1h").sign(key);
      expect(await readSessionToken(t, key)).toBeNull();
    }
  });

  it("refuses another key, alg none and expired tokens", async () => {
    const t = await signSessionToken(claims, key, 60);
    expect(await readSessionToken(t, new TextEncoder().encode("j".repeat(40)))).toBeNull();
    const [, body] = t.split(".");
    const none = `${Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url")}.${body}.`;
    expect(await readSessionToken(none, key)).toBeNull();
    const expired = await new SignJWT({ ...claims, typ: "session" }).setProtectedHeader({ alg: "HS256" }).setAudience("nearbags:session").setIssuedAt(1000).setExpirationTime(2000).sign(key);
    expect(await readSessionToken(expired, key)).toBeNull();
  });
});
