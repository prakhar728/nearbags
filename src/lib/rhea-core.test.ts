import { describe, expect, it } from "vitest";
import { getAsset } from "@/lib/assets";
import { buildPayload, type Intent } from "@/lib/intents/payload";
import nearlyBuy from "./__fixtures__/rhea-nearly-buy-CbmRdx.json";
import {
  allowedPools,
  checkSwapPayload,
  checkWithdrawPayload,
  costVsMid,
  DCL_CONTRACT,
  disagreementProblem,
  judgeSafety,
  memeMidUsd,
  minOutput,
  pointToPrice,
  routeFor,
  swapIntent,
  swapSettlement,
  tokenOf,
  USDC_TOKEN,
  USDC_WNEAR_POOL,
  withdrawIntent,
  withdrawSettlement,
  type SwapSpec,
} from "./rhea-core";

const ACC = "a".repeat(64);
const HOOT = "hoot-8ecf65.launchpad.justhoot.near";
const HOOT_POOL = `${HOOT}|wrap.near|10000`;
const NEARLY = "nearly-993927.nearlytrade.near";

const spec: SwapSpec = {
  account: ACC,
  token: USDC_TOKEN,
  amount: "10000000",
  poolIds: [USDC_WNEAR_POOL, HOOT_POOL],
  outputToken: HOOT,
  minOut: "7649017260434912470083",
};
const claimOf = (intents: Intent[], signer = ACC) => {
  const j = JSON.parse(buildPayload(signer, intents));
  return { signer_id: j.signer_id as string, intents: j.intents as Intent[] };
};
/** The planned intent with one field of the withdraw or the Swap msg changed. */
const tweak = (patch: Record<string, unknown>, swapPatch: Record<string, unknown> = {}): Intent[] => {
  const i = swapIntent(spec) as Record<string, unknown>;
  const msg = JSON.parse(i.msg as string);
  return [{ ...i, ...patch, msg: JSON.stringify({ Swap: { ...msg.Swap, ...swapPatch } }) } as Intent];
};

describe("Rhea routes", () => {
  it("goes USDC → wNEAR → meme for buys and back the other way for sells", () => {
    expect(routeFor("USDC", "HOOT")).toEqual([USDC_WNEAR_POOL, HOOT_POOL]);
    expect(routeFor("NEARLY", "USDC")).toEqual([`${NEARLY}|wrap.near|10000`, USDC_WNEAR_POOL]);
    expect(routeFor("NEAR", "HOOT")).toEqual([HOOT_POOL]);
  });
  it("refuses pairs that aren't one meme coin against USDC or NEAR", () => {
    expect(() => routeFor("HOOT", "NEARLY")).toThrow();
    expect(() => routeFor("TSLA", "HOOT")).toThrow();
    expect(() => routeFor("USDC", "BTC")).toThrow();
  });
  it("allowlists only USDC/wNEAR and each meme coin's main pool", () => {
    const pools = allowedPools();
    expect([...pools].sort()).toEqual(
      [
        USDC_WNEAR_POOL,
        HOOT_POOL,
        `${NEARLY}|wrap.near|10000`,
        "imeme-2.v2-launchpad.justhoot.near|wrap.near|10000",
      ].sort(),
    );
    expect(pools.has(`${HOOT}|wrap.near|2000`)).toBe(false);
  });
  it("strips nep141: and rejects other token standards", () => {
    expect(tokenOf("nep141:wrap.near")).toBe("wrap.near");
    expect(() => tokenOf("nep245:v2_1.omni.hot.tg:56_11111111111111111111")).toThrow();
  });
});

describe("Rhea leg builder", () => {
  it("sets min out at quote × (1 − 2%), rounded down", () => {
    expect(minOutput(10_000n)).toBe(9_800n);
    expect(minOutput(7805119653505012724575n)).toBe(7649017260434912470083n);
    expect(minOutput(99n)).toBe(97n);
  });
  it("builds the same ft_withdraw shape as the mainnet echo swaps", () => {
    const i = swapIntent(spec) as Extract<Intent, { intent: "ft_withdraw" }>;
    expect(i).toMatchObject({ intent: "ft_withdraw", token: USDC_TOKEN, receiver_id: DCL_CONTRACT, amount: "10000000", min_gas: "150000000000000" });
    expect(JSON.parse(i.msg!)).toEqual({
      Swap: { pool_ids: [USDC_WNEAR_POOL, HOOT_POOL], output_token: HOOT, min_output_amount: spec.minOut, skip_unwrap_near: true, client_echo: ACC },
    });
    // Key order matches tx CbmRdx… (pool_ids, output_token, min_output_amount, skip_unwrap_near, client_echo).
    expect(Object.keys(JSON.parse(i.msg!).Swap)).toEqual(["pool_ids", "output_token", "min_output_amount", "skip_unwrap_near", "client_echo"]);
  });
});

describe("Rhea relay allowlist", () => {
  it("accepts exactly the planned swap", () => {
    expect(checkSwapPayload(claimOf([swapIntent(spec)]), spec)).toBeNull();
  });
  it("refuses a client_echo other than the signer (output would go elsewhere)", () => {
    expect(checkSwapPayload(claimOf(tweak({}, { client_echo: "b".repeat(64) })), spec)).toMatch(/client_echo/);
  });
  it("refuses a receiver other than the DCL contract", () => {
    expect(checkSwapPayload(claimOf(tweak({ receiver_id: "evil.near" })), spec)).toMatch(/receiver/);
    expect(checkSwapPayload(claimOf(tweak({ receiver_id: "v2.ref-finance.near" })), spec)).toMatch(/receiver/);
  });
  it("refuses pools off the allowlist or out of order", () => {
    expect(checkSwapPayload(claimOf(tweak({}, { pool_ids: [USDC_WNEAR_POOL, `${HOOT}|wrap.near|2000`] })), spec)).toMatch(/allowlist/);
    expect(checkSwapPayload(claimOf(tweak({}, { pool_ids: [HOOT_POOL, USDC_WNEAR_POOL] })), spec)).toMatch(/route/);
  });
  it("refuses another token, amount, output or a lower minimum", () => {
    expect(checkSwapPayload(claimOf(tweak({ token: "wrap.near" })), spec)).toMatch(/input token/);
    expect(checkSwapPayload(claimOf(tweak({ amount: "10000001" })), spec)).toMatch(/amount/);
    expect(checkSwapPayload(claimOf(tweak({}, { output_token: NEARLY })), spec)).toMatch(/output/);
    expect(checkSwapPayload(claimOf(tweak({}, { min_output_amount: "1" })), spec)).toMatch(/minimum/);
    expect(checkSwapPayload(claimOf(tweak({}, { min_output_amount: "0" })), spec)).toMatch(/minimum/);
  });
  it("refuses extra fields, extra intents, other signers and other message shapes", () => {
    expect(checkSwapPayload(claimOf(tweak({ storage_deposit: "1" })), spec)).toMatch(/unexpected field/);
    expect(checkSwapPayload(claimOf(tweak({}, { referral_id: "me.near" })), spec)).toMatch(/Swap fields/);
    expect(checkSwapPayload(claimOf(tweak({}, { skip_unwrap_near: false })), spec)).toMatch(/skip_unwrap/);
    expect(checkSwapPayload(claimOf([swapIntent(spec), swapIntent(spec)]), spec)).toMatch(/one intent/);
    expect(checkSwapPayload(claimOf([swapIntent(spec)], "b".repeat(64)), spec)).toMatch(/another account/);
    expect(checkSwapPayload(claimOf([{ intent: "transfer", receiver_id: "x.near", tokens: { [`nep141:${USDC_TOKEN}`]: "1" } }]), spec)).toMatch(/ft_withdraw/);
    const notSwap = { ...(swapIntent(spec) as Record<string, unknown>), msg: JSON.stringify({ Deposit: {} }) } as Intent;
    expect(checkSwapPayload(claimOf([notSwap]), spec)).toMatch(/not a Swap/);
  });
  it("allows a meme withdrawal only to the leg's recipient, without a msg", () => {
    const w = { account: ACC, token: HOOT, receiver: "alice.near", amount: "5" };
    expect(checkWithdrawPayload(claimOf([withdrawIntent(w)]), w)).toBeNull();
    expect(checkWithdrawPayload(claimOf([withdrawIntent({ ...w, receiver: "bob.near" })]), w)).toMatch(/differs/);
    expect(checkWithdrawPayload(claimOf([{ ...withdrawIntent(w), msg: "{}" } as Intent]), w)).toMatch(/unexpected/);
  });
});

describe("Rhea settlement", () => {
  const BUYER = "df613234bb2870caf74d456553d2b6c3fa67b9a0b9b9d2e630e94f47bc2b1b77";
  it("reads the mainnet NEARLY buy (tx CbmRdx…) as a success with the minted amount", () => {
    expect(swapSettlement(nearlyBuy, BUYER, "nep141:wrap.near", `nep141:${NEARLY}`)).toEqual({ outcome: "success", amountOut: "13149365746160084847905", refunded: "0" });
  });
  it("ignores mints for other accounts and logs from other contracts", () => {
    expect(swapSettlement(nearlyBuy, ACC, "nep141:wrap.near", `nep141:${NEARLY}`)).toEqual({ outcome: "unknown" });
    const spoof = nearlyBuy.map((r) => ({ ...r, executor_id: r.executor_id === "intents.near" ? "dclv2.ref-labs.near" : r.executor_id }));
    expect(swapSettlement(spoof, BUYER, "nep141:wrap.near", `nep141:${NEARLY}`)).toEqual({ outcome: "unknown" });
  });
  it("reads a re-credited input as refunded", () => {
    const mint = (token: string, amount: string) =>
      `EVENT_JSON:${JSON.stringify({ standard: "nep245", version: "1.0.0", event: "mt_mint", data: [{ owner_id: ACC, token_ids: [token], amounts: [amount], memo: "refund" }] })}`;
    const logs = [{ executor_id: "intents.near", logs: [mint(`nep141:${USDC_TOKEN}`, "10000000")] }];
    expect(swapSettlement(logs, ACC, `nep141:${USDC_TOKEN}`, `nep141:${HOOT}`)).toEqual({ outcome: "refunded", refunded: "10000000" });
    expect(withdrawSettlement(logs, ACC, `nep141:${USDC_TOKEN}`)).toEqual({ outcome: "refunded", refunded: "10000000" });
  });
  it("reads a burned-and-not-returned withdrawal as delivered", () => {
    const burn = `EVENT_JSON:${JSON.stringify({ standard: "nep245", version: "1.0.0", event: "mt_burn", data: [{ owner_id: ACC, token_ids: [`nep141:${HOOT}`], amounts: ["5"], memo: "withdraw" }] })}`;
    expect(withdrawSettlement([{ executor_id: "intents.near", logs: [burn] }], ACC, `nep141:${HOOT}`)).toEqual({ outcome: "success", amountOut: "5", refunded: "0" });
  });
});

describe("Rhea pricing", () => {
  it("turns a DCL point into a price (HOOT/wNEAR at point 58654 ≈ 3.525e-4 NEAR)", () => {
    expect(pointToPrice(0, 24, 24)).toBe(1);
    expect(pointToPrice(58654, 18, 24)).toBeCloseTo(3.525e-4, 6);
  });
  it("prices a meme coin in USD from either side of the pool", () => {
    const x = memeMidUsd({ token_x: HOOT, token_y: "wrap.near", current_point: 58654 }, HOOT, 18, 3.57);
    expect(x).toBeCloseTo(3.525e-4 * 3.57, 6);
    // Same price expressed with wNEAR as token_x: price(wNEAR in HOOT) = 1 / price(HOOT in wNEAR).
    const y = memeMidUsd({ token_x: "wrap.near", token_y: HOOT, current_point: -58654 }, HOOT, 18, 3.57);
    expect(y).toBeCloseTo(x, 8);
    expect(() => memeMidUsd({ token_x: "usdc.near", token_y: HOOT, current_point: 0 }, HOOT, 18, 3.57)).toThrow();
  });
  it("holds buys while the pool mid is >10% from the indexers", () => {
    expect(disagreementProblem("HOOT", undefined)).toBeNull();
    expect(disagreementProblem("HOOT", 0.011)).toBeNull();
    expect(disagreementProblem("HOOT", 0.25)).toMatch(/25% away/);
  });
  it("measures cost against the mid", () => {
    expect(costVsMid({ usdIn: 10, unitsOut: 7805.12, midUsd: 1.258967e-3 })).toBeCloseTo(0.0174, 3);
    expect(costVsMid({ unitsIn: 1000, midUsd: 0.001, usdOut: 0.99 })).toBeCloseTo(0.01, 6);
  });
});

describe("meme coin safety", () => {
  const hoot = getAsset("HOOT");
  it("passes HOOT only with no transfer fee and the pinned code", () => {
    expect(judgeSafety(hoot, { transferFeePips: 0, codeHash: hoot.rhea!.pinnedCodeHash }).ok).toBe(true);
    expect(judgeSafety(hoot, { transferFeePips: 10_000, codeHash: hoot.rhea!.pinnedCodeHash })).toMatchObject({ ok: false, reason: expect.stringMatching(/1\.00% transfer fee/) });
    expect(judgeSafety(hoot, { transferFeePips: 0, codeHash: "other" })).toMatchObject({ ok: false, reason: expect.stringMatching(/upgraded/) });
    expect(judgeSafety(hoot, { transferFeePips: null, codeHash: null }).ok).toBe(false);
  });
  it("has nothing to check on immutable NEARLY or on 1Click assets", () => {
    expect(judgeSafety(getAsset("NEARLY"), {}).ok).toBe(true);
    expect(judgeSafety(getAsset("BTC"), {}).ok).toBe(true);
  });
});

describe("Rhea coins", () => {
  it("every Rhea coin's pool is on the allowlist, and nothing else", () => {
    const pools = allowedPools();
    for (const id of ["HOOT", "NEARLY", "IMEME"]) expect(pools.has(getAsset(id).rhea!.pool)).toBe(true);
    expect(pools.size).toBe(4);
  });
});
