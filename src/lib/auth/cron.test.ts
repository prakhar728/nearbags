import { describe, expect, it } from "vitest";
import { cronAuthorized, safeEqual } from "./cron";

const req = (auth?: string) => new Request("http://localhost/api/cron/prices", { headers: auth ? { authorization: auth } : {} });

describe("cron secret", () => {
  it("compares in constant time and refuses length mismatches", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
  it("needs the exact bearer secret", () => {
    expect(cronAuthorized(req("Bearer s3cret-value"), "s3cret-value")).toBe(true);
    expect(cronAuthorized(req("Bearer s3cret-valuX"), "s3cret-value")).toBe(false);
    expect(cronAuthorized(req(), "s3cret-value")).toBe(false);
    expect(cronAuthorized(req("Bearer "), "")).toBe(false);
    expect(cronAuthorized(req("Bearer undefined"), undefined)).toBe(false);
  });
});
