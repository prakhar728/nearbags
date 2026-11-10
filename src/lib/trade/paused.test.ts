import { describe, expect, it } from "vitest";
import { buyBlockReason, listOf } from "./paused";

describe("paused trading", () => {
  it("lists assets in plain English", () => {
    expect(listOf([])).toBe("");
    expect(listOf(["QQQ"])).toBe("QQQ");
    expect(listOf(["QQQ", "HOOD"])).toBe("QQQ and HOOD");
    expect(listOf(["QQQ", "HOOD", "TSLA"])).toBe("QQQ, HOOD and TSLA");
  });
  it("allows a buy only when every asset can be bought and sold", () => {
    expect(buyBlockReason({ cantBuy: [], cantSell: [] })).toBeNull();
    expect(buyBlockReason({ cantBuy: ["QQQ"], cantSell: [] })).toMatch(/Buying QQQ is paused/);
    expect(buyBlockReason({ cantBuy: [], cantSell: ["QQQ"] })).toMatch(/Selling QQQ is paused.*can't end up holding/);
  });
});
