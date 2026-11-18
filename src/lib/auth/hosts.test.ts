import { describe, expect, it } from "vitest";
import { isAllowedHost, originAllowed, originFor, signInHost } from "./hosts";

describe("isAllowedHost", () => {
  it("accepts our hosts and localhost on any port", () => {
    for (const h of ["nearbags.com", "www.nearbags.com", "NEARBAGS.COM", "stonkbag-iota.vercel.app", "localhost:3093", "localhost:3000", "localhost"]) expect(isAllowedHost(h)).toBe(true);
  });
  it("refuses everything else", () => {
    for (const h of ["nearbags.com.evil.io", "evil.nearbags.com.io", "nearbags.co", "xnearbags.com", "stonkbag-other.vercel.app", "localhost.evil.io", "127.0.0.1:3093", "", null, undefined]) expect(isAllowedHost(h)).toBe(false);
  });
});

describe("signInHost", () => {
  it("prefers the request host when it is ours", () => {
    expect(signInHost("www.nearbags.com", "https://nearbags.com")).toBe("www.nearbags.com");
    expect(signInHost("localhost:3093", undefined)).toBe("localhost:3093");
  });
  it("falls back to NEXT_PUBLIC_SITE_URL, and only when that is ours", () => {
    expect(signInHost("preview-abc.vercel.app", "https://nearbags.com")).toBe("nearbags.com");
    expect(signInHost("evil.io", "https://evil.io")).toBeNull();
    expect(signInHost(null, "not a url")).toBeNull();
  });
});

describe("originFor", () => {
  it("uses http only for localhost", () => {
    expect(originFor("localhost:3093")).toBe("http://localhost:3093");
    expect(originFor("nearbags.com")).toBe("https://nearbags.com");
  });
});

describe("originAllowed (CSRF)", () => {
  it("accepts same-host origins", () => {
    expect(originAllowed("http://localhost:3093", "localhost:3093")).toBe(true);
    expect(originAllowed("https://nearbags.com", "nearbags.com")).toBe(true);
    expect(originAllowed("https://preview-abc.vercel.app", "preview-abc.vercel.app")).toBe(true);
  });
  it("accepts our production hosts across each other", () => {
    expect(originAllowed("https://www.nearbags.com", "nearbags.com")).toBe(true);
  });
  it("refuses missing, null, foreign and cross-port localhost origins", () => {
    expect(originAllowed(null, "nearbags.com")).toBe(false);
    expect(originAllowed("null", "nearbags.com")).toBe(false);
    expect(originAllowed("https://evil.io", "nearbags.com")).toBe(false);
    expect(originAllowed("https://nearbags.com.evil.io", "nearbags.com")).toBe(false);
    expect(originAllowed("http://localhost:9999", "nearbags.com")).toBe(false);
    expect(originAllowed("http://localhost:9999", "localhost:3093")).toBe(false);
    expect(originAllowed("garbage", "nearbags.com")).toBe(false);
  });
});
