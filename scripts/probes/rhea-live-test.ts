// The $1–2 live test of a meme-coin (Rhea) leg, for a human to run. It uses the app's own leg builder, relay allowlist,
// relayer and settlement reader, on a throwaway NEAR Intents account whose key lives in .rhea-test-key.json (gitignored).
//
// Nothing is sent unless you pass --send. Without it, every step quotes, builds, signs with the test key, checks the
// allowlist and dry-runs on intents.near (simulate_intents), then stops.
//
//   T="pnpm tsx --env-file=.env.local --conditions=react-server scripts/probes/rhea-live-test.ts"
//   $T init                          # make the test key, print its account and how to fund it with ~$2 USDC
//   $T status                        # USDC / HOOT / NEARLY / wNEAR balances of the test account
//   $T buy HOOT 1 [--send]           # $1 USDC → HOOT through Rhea (USDC → wNEAR → HOOT, one multi-hop)
//   $T sell HOOT [--send]            # all HOOT → USDC
//   $T withdraw you.near [--send]    # all USDC back to your NEAR account (plain ft_withdraw)
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { getAsset, USDC } from "../../src/lib/assets";
import { bytesToHex, hexToBytes, keyFromSecret, randomBasketKey, type BasketKey } from "../../src/lib/intents/keys";
import { buildPayload, parsePayload, signRaw, type SignedRawEd25519 } from "../../src/lib/intents/payload";
import { balancesOf, simulateIntents } from "../../src/lib/intents/rpc";
import { relay } from "../../src/lib/relayer";
import {
  checkSwapPayload,
  checkWithdrawPayload,
  minOutput,
  quoteLeg,
  RHEA_DEADLINE_MS,
  swapIntent,
  swapSettlement,
  tokenOf,
  tokenSafety,
  withdrawIntent,
  withdrawSettlement,
} from "../../src/lib/rhea";

const KEY_FILE = ".rhea-test-key.json";
const args = process.argv.slice(2);
const send = args.includes("--send");
const [cmd, a1, a2] = args.filter((x) => !x.startsWith("--"));

function loadKey(): BasketKey {
  if (!existsSync(KEY_FILE)) throw new Error(`No ${KEY_FILE}. Run "init" first.`);
  return keyFromSecret(hexToBytes(JSON.parse(readFileSync(KEY_FILE, "utf8")).secretHex));
}

async function balances(k: BasketKey) {
  const ids = ["USDC", "HOOT", "NEARLY", "NEAR"].map(getAsset);
  const bals = await balancesOf(k.accountId, ids.map((a) => a.intentsAssetId));
  return Object.fromEntries(ids.map((a, i) => [a.id, { raw: bals[i], units: Number(bals[i]) / 10 ** a.decimals }]));
}

async function run(signed: SignedRawEd25519, settle: (r: Awaited<ReturnType<typeof relay>>) => unknown) {
  const sim = await simulateIntents([signed]);
  console.log("simulate_intents: ok", sim.intents_executed.map((x) => x.intent_hash).join(", "));
  if (!send) return console.log("Dry run only. Add --send to relay it (our relayer pays gas).");
  const r = await relay([signed]);
  console.log("tx", r.txHash, `https://nearblocks.io/txns/${r.txHash}`);
  console.log("settlement", settle(r));
}

async function main() {
  if (cmd === "init") {
    if (existsSync(KEY_FILE)) throw new Error(`${KEY_FILE} exists already; delete it only once its account is empty.`);
    const k = randomBasketKey();
    writeFileSync(KEY_FILE, JSON.stringify({ accountId: k.accountId, secretHex: bytesToHex(k.secretKey) }), { mode: 0o600 });
    console.log(`Test account (NEAR Intents): ${k.accountId}`);
    console.log("Fund it with ~$2 USDC inside NEAR Intents, e.g. from your NEAR wallet:");
    console.log(`  near call ${tokenOf(USDC.intentsAssetId)} ft_transfer_call '{"receiver_id":"intents.near","amount":"2000000","msg":"${k.accountId}"}' --accountId <you.near> --depositYocto 1 --gas 100000000000000`);
    return;
  }
  if (!["status", "buy", "sell", "withdraw"].includes(cmd ?? "")) {
    return console.log("Commands: init | status | buy <HOOT|NEARLY> <usd> | sell <HOOT|NEARLY> | withdraw <you.near>   (add --send to relay)");
  }
  const k = loadKey();
  if (cmd === "status") return console.log(k.accountId, await balances(k));

  if (cmd === "buy" || cmd === "sell") {
    const meme = getAsset(a1 ?? "HOOT");
    if (meme.venue !== "rhea") throw new Error(`${meme.id} isn't a Rhea asset`);
    const bal = await balances(k);
    const [from, to] = cmd === "buy" ? ["USDC", meme.id] : [meme.id, "USDC"];
    const amount = cmd === "buy" ? String(Math.round(Number(a2 ?? "1") * 1e6)) : bal[meme.id].raw;
    if (BigInt(amount) === 0n || BigInt(amount) > BigInt(bal[from].raw)) throw new Error(`Not enough ${from}: have ${bal[from].units}`);
    const safety = await tokenSafety(meme.id);
    console.log("safety", safety);
    if (cmd === "buy" && !safety.ok) throw new Error("Buys are paused for this token.");
    const q = await quoteLeg(from, to, amount);
    const spec = { account: k.accountId, token: q.inputToken, amount, poolIds: q.poolIds, outputToken: q.outputToken, minOut: minOutput(BigInt(q.amountOut)).toString() };
    console.log("quote", { from, to, amountIn: amount, amountOut: q.amountOut, minOut: spec.minOut, pools: q.poolIds });
    const signed = signRaw(k, buildPayload(k.accountId, [swapIntent(spec)], { deadlineMs: RHEA_DEADLINE_MS }));
    const why = checkSwapPayload(parsePayload(signed), spec);
    if (why) throw new Error(`Allowlist refused it: ${why}`);
    console.log("allowlist: ok");
    await run(signed, (r) => swapSettlement(r.receipts, k.accountId, getAsset(from).intentsAssetId, getAsset(to).intentsAssetId));
    if (send) console.log("balances after", await balances(k));
    return;
  }

  if (cmd === "withdraw") {
    if (!a1) throw new Error("withdraw <your NEAR account>");
    const bal = await balances(k);
    const w = { account: k.accountId, token: tokenOf(USDC.intentsAssetId), receiver: a1, amount: bal.USDC.raw };
    if (BigInt(w.amount) === 0n) throw new Error("No USDC to withdraw.");
    const signed = signRaw(k, buildPayload(k.accountId, [withdrawIntent(w)], { deadlineMs: RHEA_DEADLINE_MS }));
    const why = checkWithdrawPayload(parsePayload(signed), w);
    if (why) throw new Error(`Allowlist refused it: ${why}`);
    await run(signed, (r) => withdrawSettlement(r.receipts, k.accountId, USDC.intentsAssetId));
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error((e as Error).message);
    process.exit(1);
  });
