"use client";
// Drives an order from the browser (spec §5.4–5.5). Idempotent: call it on any order in any state and it does the
// next safe step — sign fees, prepare + sign + submit pending legs — then polls until the order is done.
// Refunded/failed legs are left for the user to retry explicitly (retryLeg).
//
// Nothing is signed on the server's word alone (security audit 2026-11-18, #1). Before the key signs, the browser
// checks the payload itself (lib/intents/expect.ts): fees are at most 1.6% of the USDC actually in the account, a
// 1Click swap's deposit address belongs to a 1Click quote that pays back into the account (or to an address the user
// confirmed here), and a Rhea swap echoes back to the account.
import { signIntents, signRaw } from "@/lib/intents/payload";
import type { BasketKey } from "@/lib/intents/keys";
import { balancesOf } from "@/lib/intents/rpc";
import { checkFees, checkOneClickPayload, checkQuoteRecord, checkRheaPayload, type LegExpect, type QuoteRecord } from "@/lib/intents/expect";
import { USDC } from "@/lib/assets";
import type { OrderView } from "@/lib/trade/orders";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) }, cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? `Request failed (${r.status})`);
  return j as T;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const getOrder = (id: number) => api<OrderView>(`/api/orders/${id}`);

export class RefusedToSign extends Error {
  constructor(why: string) {
    super(`Stopped before signing: ${why}. Nothing was sent.`);
  }
}

type LegView = OrderView["legs"][number];

/** Where a step's output may go, from the user's own confirmations in this browser. */
function recipientFor(v: OrderView, leg: LegView, confirmed: readonly string[]): string | null {
  const to = leg.isPayout ? v.order.payoutAddress : leg.recipient;
  if (!to) {
    if (leg.isPayout) throw new RefusedToSign("the payout has no address");
    return null;
  }
  if (!confirmed.includes(to)) throw new RefusedToSign(`this step pays out to ${to}, which you didn't confirm here`);
  return to;
}

async function checkLeg(payload: string, e: LegExpect, venue: LegView["venue"]) {
  if (venue === "rhea") {
    const why = checkRheaPayload(payload, e);
    if (why) throw new RefusedToSign(why);
    return;
  }
  const c = checkOneClickPayload(payload, e);
  if (typeof c === "string") throw new RefusedToSign(c);
  // 1Click's own public record of this deposit address: who it pays and who it refunds.
  const r = await fetch(`https://1click.chaindefuser.com/v0/status?depositAddress=${encodeURIComponent(c.depositAddress)}`, { cache: "no-store" });
  if (!r.ok) throw new RefusedToSign("1Click doesn't know this deposit address");
  const why = checkQuoteRecord((await r.json()) as QuoteRecord, { ...e, ...c });
  if (why) throw new RefusedToSign(why);
}

async function runLeg(v: OrderView, seq: number, key: BasketKey, confirmed: readonly string[]) {
  const leg = v.legs.find((l) => l.seq === seq);
  if (!leg) throw new Error("No such swap.");
  const expect: LegExpect = { accountId: key.accountId, assetFrom: leg.assetFrom, assetTo: leg.assetTo, maxIn: BigInt(leg.amountIn), recipient: recipientFor(v, leg, confirmed) };
  const prep = await api<{ payload: string; accountId: string }>(`/api/orders/${v.order.id}/legs/${seq}/intent`, { method: "POST" });
  if (prep.accountId !== key.accountId) throw new Error("This browser holds a different key for this basket.");
  await checkLeg(prep.payload, expect, leg.venue);
  await api(`/api/orders/${v.order.id}/legs/${seq}/submit`, { method: "POST", body: JSON.stringify({ signed: signRaw(key, prep.payload) }) });
}

export async function retryLeg(orderId: number, seq: number, key: BasketKey, confirmed: readonly string[] = []) {
  await runLeg(await getOrder(orderId), seq, key, confirmed);
}

export interface RunOptions {
  onUpdate: (v: OrderView) => void;
  signal?: AbortSignal;
  pollMs?: number;
  /** A swap couldn't start: show the reason. Called with null once it starts. */
  onLegError?: (seq: number, message: string | null) => void;
  /** Payout or withdrawal addresses the user confirmed in this browser. Any other destination is refused. */
  confirmed?: readonly string[];
}

export async function driveOrder(orderId: number, key: BasketKey, { onUpdate, signal, pollMs = 4000, onLegError, confirmed = [] }: RunOptions): Promise<OrderView> {
  const legErrors = new Map<number, number>();
  for (;;) {
    if (signal?.aborted) throw new DOMException("Stopped", "AbortError");
    const v = await getOrder(orderId);
    onUpdate(v);
    if (v.order.accountId !== key.accountId) throw new Error("This browser holds a different key for this basket.");

    if (v.next === "done") return v;
    if (v.next === "sign_fees") {
      legErrors.clear(); // a repaired order re-plans its swaps; give them fresh tries
      const { intents } = await api<{ intents: Parameters<typeof signIntents>[1] }>(`/api/orders/${orderId}/fees`);
      const [usdc] = await balancesOf(key.accountId, [USDC.intentsAssetId]);
      const why = checkFees(intents, BigInt(usdc));
      if (why) throw new RefusedToSign(why);
      await api(`/api/orders/${orderId}/fees`, { method: "POST", body: JSON.stringify({ signed: signIntents(key, intents) }) });
      continue;
    }
    if (v.next === "run_legs") {
      const pending = v.legs.filter((l) => l.ready && (legErrors.get(l.seq) ?? 0) < 2);
      const one = (seq: number) =>
        runLeg(v, seq, key, confirmed)
          .then(() => onLegError?.(seq, null))
          .catch((e) => {
            // A refusal to sign is final: never retry it, show it.
            if (e instanceof RefusedToSign) throw e;
            legErrors.set(seq, (legErrors.get(seq) ?? 0) + 1);
            onLegError?.(seq, (e as Error).message);
          });
      // 1Click legs run side by side. Rhea legs are relayed by our own account and wait for the swap to finish, so
      // they go one after another (no relayer nonce races, and each reads the balance the last one left).
      const rhea = pending.filter((l) => l.venue === "rhea");
      await Promise.all([
        ...pending.filter((l) => l.venue !== "rhea").map((l) => one(l.seq)),
        (async () => {
          for (const l of rhea) await one(l.seq);
        })(),
      ]);
      if (pending.length) continue;
    }
    await sleep(pollMs);
  }
}
