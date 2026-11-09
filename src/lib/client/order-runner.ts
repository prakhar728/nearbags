"use client";
// Drives an order from the browser (spec §5.4–5.5). Idempotent: call it on any order in any state and it does the
// next safe step — sign fees, prepare + sign + submit pending legs — then polls until the order is done.
// Refunded/failed legs are left for the user to retry explicitly (retryLeg).
import { signIntents, signRaw } from "@/lib/intents/payload";
import type { BasketKey } from "@/lib/intents/keys";
import type { OrderView } from "@/lib/trade/orders";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) }, cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? `Request failed (${r.status})`);
  return j as T;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const getOrder = (id: number) => api<OrderView>(`/api/orders/${id}`);

async function runLeg(orderId: number, seq: number, key: BasketKey) {
  const prep = await api<{ payload: string; accountId: string }>(`/api/orders/${orderId}/legs/${seq}/intent`, { method: "POST" });
  if (prep.accountId !== key.accountId) throw new Error("This browser holds a different key for this basket.");
  await api(`/api/orders/${orderId}/legs/${seq}/submit`, { method: "POST", body: JSON.stringify({ signed: signRaw(key, prep.payload) }) });
}

export async function retryLeg(orderId: number, seq: number, key: BasketKey) {
  await runLeg(orderId, seq, key);
}

export interface RunOptions {
  onUpdate: (v: OrderView) => void;
  signal?: AbortSignal;
  pollMs?: number;
}

export async function driveOrder(orderId: number, key: BasketKey, { onUpdate, signal, pollMs = 4000 }: RunOptions): Promise<OrderView> {
  const legErrors = new Map<number, number>();
  for (;;) {
    if (signal?.aborted) throw new DOMException("Stopped", "AbortError");
    const v = await getOrder(orderId);
    onUpdate(v);
    if (v.order.accountId !== key.accountId) throw new Error("This browser holds a different key for this basket.");

    if (v.next === "done") return v;
    if (v.next === "sign_fees") {
      const { intents } = await api<{ intents: Parameters<typeof signIntents>[1] }>(`/api/orders/${orderId}/fees`);
      await api(`/api/orders/${orderId}/fees`, { method: "POST", body: JSON.stringify({ signed: signIntents(key, intents) }) });
      continue;
    }
    if (v.next === "run_legs") {
      const pending = v.legs.filter((l) => l.ready && (legErrors.get(l.seq) ?? 0) < 2);
      await Promise.all(
        pending.map((l) =>
          runLeg(orderId, l.seq, key).catch((e) => {
            legErrors.set(l.seq, (legErrors.get(l.seq) ?? 0) + 1);
            console.warn(`leg ${l.seq}:`, (e as Error).message);
          }),
        ),
      );
      if (pending.length) continue;
    }
    await sleep(pollMs);
  }
}
