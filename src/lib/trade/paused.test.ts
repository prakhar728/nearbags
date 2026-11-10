import { describe, expect, it } from "vitest";
import { buyBlockReason, listOf, venueOf } from "./paused";

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

describe("paused wording by venue", () => {
  it("names Rhea for meme coins and gives our own reason when we paused it", () => {
    expect(venueOf(["QQQ"])).toBe("NEAR Intents");
    expect(venueOf(["HOOT"])).toBe("Rhea");
    expect(venueOf(["HOOT", "BTC"])).toBe("NEAR Intents and Rhea");
    expect(buyBlockReason({ cantBuy: ["NEARLY"], cantSell: [] })).toMatch(/paused on Rhea/);
    expect(buyBlockReason({ cantBuy: ["HOOT"], cantSell: [], why: { HOOT: "HOOT now charges a 1.00% transfer fee." } })).toBe(
      "Buying HOOT is paused: HOOT now charges a 1.00% transfer fee. Holders can still sell.",
    );
  });
});
