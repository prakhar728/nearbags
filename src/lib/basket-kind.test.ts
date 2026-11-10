import { describe, expect, it } from "vitest";
import { basketKind, hasMeme } from "./basket-kind";

const b = (...ids: string[]) => ids.map((assetId) => ({ assetId }));

describe("explore buckets", () => {
  it("sorts baskets into stocks, crypto, mixed and meme", () => {
    expect(basketKind(b("TSLA", "USDC"))).toBe("stocks");
    expect(basketKind(b("BTC", "ETH"))).toBe("crypto");
    expect(basketKind(b("TSLA", "BTC"))).toBe("mixed");
    expect(basketKind(b("HOOT", "NEARLY"))).toBe("meme");
    expect(basketKind(b("HOOT", "NEAR", "USDC"))).toBe("meme");
  });
  it("spots any meme coin", () => {
    expect(hasMeme(b("BTC", "NEARLY"))).toBe(true);
    expect(hasMeme(b("BTC", "ETH"))).toBe(false);
  });
});
