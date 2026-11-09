import { describe, expect, it } from "vitest";
import { eligibility } from "./compliance";

const all = { risk: "t", not_us_person: "t", professional: "t" };
const stocks = ["TSLA", "BTC"];
const crypto = ["BTC", "ETH"];

describe("eligibility", () => {
  it("blocks sanctioned countries for everything", () => {
    expect(eligibility({ country: "IR", region: null, assetIds: crypto, attested: all }).status).toBe("blocked");
    expect(eligibility({ country: "UA", region: "43", assetIds: crypto, attested: all }).status).toBe("blocked"); // Crimea
    expect(eligibility({ country: "UA", region: "30", assetIds: crypto, attested: all }).status).toBe("ok"); // Kyiv
  });
  it("US: stock baskets blocked, crypto-only allowed", () => {
    expect(eligibility({ country: "US", region: null, assetIds: stocks, attested: all }).status).toBe("blocked");
    expect(eligibility({ country: "US", region: null, assetIds: crypto, attested: all }).status).toBe("ok");
  });
  it("EU stock baskets need the professional attestation; crypto-only doesn't", () => {
    expect(eligibility({ country: "DE", region: null, assetIds: stocks, attested: { risk: "t", not_us_person: "t" } }).needs).toEqual(["professional"]);
    expect(eligibility({ country: "DE", region: null, assetIds: crypto, attested: { risk: "t" } }).status).toBe("ok");
  });
  it("everyone needs the risk disclosure; stock buyers also the US-person check", () => {
    expect(eligibility({ country: "IN", region: null, assetIds: stocks, attested: {} }).needs).toEqual(["risk", "not_us_person"]);
    expect(eligibility({ country: "IN", region: null, assetIds: crypto, attested: {} }).needs).toEqual(["risk"]);
    expect(eligibility({ country: "IN", region: null, assetIds: stocks, attested: all }).status).toBe("ok");
  });
});
