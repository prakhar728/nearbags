import { describe, expect, it } from "vitest";
import { getAsset, USDC } from "@/lib/assets";
import { swapIntent, DCL_CONTRACT, routeFor, tokenOf } from "@/lib/rhea-core";
import { buildPayload } from "./payload";
import { checkFees, checkOneClickPayload, checkQuoteRecord, checkRheaPayload, type LegExpect } from "./expect";

// Shapes from the round 1 test (local order 15, a sell paid out to testing69.near).
const ACC = "d0d1557d9722e701f0ab3a4faa979b8043096b5f8b706e3e8e8088d890b684c2";
const DEP = "5a68fe035a7be04c44e45dc9efadc3064b5ca8977c120fad3a947893f5c674ad";
const NOW = Date.parse("2026-11-17T11:33:36.234Z");
const payout = (over: Record<string, unknown> = {}, intents?: unknown[]) =>
  JSON.stringify({
    verifying_contract: "intents.near",
    signer_id: ACC,
    deadline: "2026-11-20T11:53:36.234Z",
    nonce: "Vij2xgAlKBKzgA4SM7a+6RjLBPcyBeYrKuIOsQZCcIY=",
    intents: intents ?? [{ intent: "transfer", receiver_id: DEP, tokens: { [USDC.intentsAssetId]: "40229913" } }],
    ...over,
  });
const leg: LegExpect = { accountId: ACC, assetFrom: USDC.intentsAssetId, assetTo: USDC.intentsAssetId, maxIn: 40229913n, recipient: "testing69.near", now: NOW };
const record = (req: Record<string, unknown> = {}, quote: Record<string, unknown> = {}) => ({
  quoteResponse: {
    quoteRequest: {
      depositType: "INTENTS",
      originAsset: USDC.intentsAssetId,
      destinationAsset: USDC.intentsAssetId,
      refundTo: ACC,
      refundType: "INTENTS",
      recipient: "testing69.near",
      recipientType: "DESTINATION_CHAIN",
      ...req,
    },
    quote: { depositAddress: DEP, amountIn: "40229913", ...quote },
  },
});

describe("checkOneClickPayload", () => {
  it("accepts the real payout payload and returns its deposit", () => {
    expect(checkOneClickPayload(payout(), leg)).toEqual({ depositAddress: DEP, amount: "40229913" });
  });
  it("refuses another signer, two steps, another token, more than planned, or a far deadline", () => {
    expect(checkOneClickPayload(payout({ signer_id: "0".repeat(64) }), leg)).toMatch(/another account/);
    expect(checkOneClickPayload(payout({}, [{ intent: "transfer", receiver_id: DEP, tokens: { [USDC.intentsAssetId]: "1" } }, { intent: "transfer", receiver_id: "evil.near", tokens: { [USDC.intentsAssetId]: "1" } }]), leg)).toMatch(/more than one/);
    expect(checkOneClickPayload(payout({}, [{ intent: "transfer", receiver_id: DEP, tokens: { "nep141:eth.omft.near": "1" } }]), leg)).toMatch(/wrong token/);
    expect(checkOneClickPayload(payout({}, [{ intent: "transfer", receiver_id: DEP, tokens: { [USDC.intentsAssetId]: "40229914" } }]), leg)).toMatch(/more than planned/);
    expect(checkOneClickPayload(payout({ deadline: "2027-01-01T00:00:00Z" }), leg)).toMatch(/deadline/);
    expect(checkOneClickPayload(payout({}, [{ intent: "ft_withdraw", token: "x", receiver_id: "evil.near", amount: "1" }]), leg)).toMatch(/isn't a transfer/);
    expect(checkOneClickPayload(payout({ verifying_contract: "evil.near" }), leg)).toMatch(/another contract/);
  });
});

describe("checkQuoteRecord", () => {
  const e = { ...leg, depositAddress: DEP, amount: "40229913" };
  it("accepts 1Click's record of the real payout quote", () => {
    expect(checkQuoteRecord(record(), e)).toBeNull();
  });
  it("refuses a quote that pays someone the user didn't confirm, or refunds elsewhere", () => {
    expect(checkQuoteRecord(record({ recipient: "attacker.near" }), e)).toMatch(/didn't confirm/);
    expect(checkQuoteRecord(record({ refundTo: "attacker.near" }), e)).toMatch(/refunds somewhere else/);
    expect(checkQuoteRecord(record({}, { depositAddress: "f".repeat(64) }), e)).toMatch(/another deposit/);
    expect(checkQuoteRecord(record({}, { amountIn: "1" }), e)).toMatch(/different amount/);
    expect(checkQuoteRecord({}, e)).toMatch(/no quote/);
  });
  it("for a swap back into the bag, the quote must deliver to the account inside Intents", () => {
    const swap = { ...e, recipient: null, assetTo: "nep141:eth.omft.near" };
    expect(checkQuoteRecord(record({ recipient: ACC, recipientType: "INTENTS", destinationAsset: "nep141:eth.omft.near" }), swap)).toBeNull();
    expect(checkQuoteRecord(record({ recipient: "attacker.near", recipientType: "INTENTS", destinationAsset: "nep141:eth.omft.near" }), swap)).toMatch(/another account/);
    expect(checkQuoteRecord(record({ recipient: ACC, recipientType: "INTENTS" }), swap)).toMatch(/different token/);
  });
});

describe("checkFees", () => {
  const t = (to: string, amt: string, asset = USDC.intentsAssetId) => ({ intent: "transfer" as const, receiver_id: to, tokens: { [asset]: amt } });
  it("accepts the real round 1 fees (1% creator + 0.25% platform on 20.006754 USDC)", () => {
    expect(checkFees([t("creator.near", "200067"), t("platform.near", "50016")], 20006754n)).toBeNull();
  });
  it("refuses fees above 1.6% of what's in the account, a non-USDC fee, three fees, or two to one account", () => {
    expect(checkFees([t("a.near", "330000")], 20006754n)).toMatch(/larger/);
    expect(checkFees([t("a.near", "1", "nep141:eth.omft.near")], 20006754n)).toMatch(/USDC/);
    expect(checkFees([t("a.near", "1"), t("b.near", "1"), t("c.near", "1")], 20006754n)).toMatch(/too many/);
    expect(checkFees([t("a.near", "1"), t("a.near", "1")], 20006754n)).toMatch(/same account/);
  });
});

describe("checkRheaPayload", () => {
  const hoot = getAsset("HOOT");
  const spec = { account: ACC, token: tokenOf(USDC.intentsAssetId), amount: "1000000", poolIds: routeFor("USDC", "HOOT"), outputToken: tokenOf(hoot.intentsAssetId), minOut: "1" };
  const e: LegExpect = { accountId: ACC, assetFrom: USDC.intentsAssetId, assetTo: hoot.intentsAssetId, maxIn: 1000000n, recipient: null };

  it("accepts a planned Rhea buy whose output comes back to the account", () => {
    expect(checkRheaPayload(buildPayload(ACC, [swapIntent(spec)]), e)).toBeNull();
  });
  it("refuses an echo to another account, a plain withdrawal elsewhere, or more than planned", () => {
    expect(checkRheaPayload(buildPayload(ACC, [swapIntent({ ...spec, account: "attacker.near" })]), e)).toMatch(/another account/);
    expect(checkRheaPayload(buildPayload(ACC, [{ intent: "ft_withdraw", token: spec.token, receiver_id: "attacker.near", amount: "1" }]), e)).toMatch(/other than Rhea/);
    expect(checkRheaPayload(buildPayload(ACC, [swapIntent({ ...spec, amount: "1000001" })]), e)).toMatch(/more than planned/);
    expect(DCL_CONTRACT).toBe("dclv2.ref-labs.near");
  });
  it("a meme withdrawal must go to the address the user confirmed", () => {
    const w = { ...e, assetFrom: hoot.intentsAssetId, recipient: "me.near", maxIn: 5n };
    expect(checkRheaPayload(buildPayload(ACC, [{ intent: "ft_withdraw", token: tokenOf(hoot.intentsAssetId), receiver_id: "me.near", amount: "5" }]), w)).toBeNull();
    expect(checkRheaPayload(buildPayload(ACC, [{ intent: "ft_withdraw", token: tokenOf(hoot.intentsAssetId), receiver_id: "evil.near", amount: "5" }]), w)).toMatch(/didn't confirm/);
  });
});
