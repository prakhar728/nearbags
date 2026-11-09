"use client";
// Reset to target weights and withdraw-as-tokens for one position (spec §5.6, §5.7).
import { useState } from "react";
import { Loading, Skeleton } from "@/components/ui/Skeleton";
import { useAuth } from "@/lib/client/auth";
import { driveOrder } from "@/lib/client/order-runner";
import type { OrderView } from "@/lib/trade/orders";

const CHAIN_NAMES: Record<string, string> = { near: "NEAR", eth: "Ethereum", bsc: "BNB Chain", sol: "Solana", btc: "Bitcoin", zec: "Zcash", xrp: "XRP Ledger", doge: "Dogecoin", sui: "Sui" };
const EVM = new Set(["eth", "bsc"]);

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, { ...init, headers: { "Content-Type": "application/json" }, cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? `Request failed (${r.status})`);
  return j as T;
}

export function ManagePanel({ positionId, basketId, onDone }: { positionId: number; basketId: number; onDone?: () => void }) {
  const { user, keyForBasket } = useAuth();
  const [chains, setChains] = useState<Record<string, string[]> | null>(null);
  const [addr, setAddr] = useState<Record<string, string>>({});
  const [view, setView] = useState<OrderView | null>(null);
  const [step, setStep] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

  async function run(start: () => Promise<OrderView>, label: string) {
    if (!user) return;
    setErr(null);
    try {
      setStep("Unlocking your basket key…");
      const { k } = await keyForBasket(basketId);
      setStep(label);
      const v = await start();
      setView(v);
      const final = await driveOrder(v.order.id, k, { onUpdate: setView });
      setStep(null);
      if (final.order.status === "complete") onDone?.();
    } catch (e) {
      setStep(null);
      setErr((e as Error).message);
    }
  }

  const openWithdraw = async () => {
    setErr(null);
    setOpening(true);
    try {
      const { chains } = await api<{ chains: Record<string, string[]> }>(`/api/orders/withdraw?positionId=${positionId}`);
      setChains(chains);
      const pre: Record<string, string> = {};
      for (const c of Object.keys(chains)) {
        if (user?.chain === "evm" && EVM.has(c)) pre[c] = user.address;
        if (user?.chain === "near" && c === "near") pre[c] = user.address;
      }
      setAddr(pre);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setOpening(false);
    }
  };

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={!!step} onClick={() => run(() => api<OrderView>("/api/orders/reset", { method: "POST", body: JSON.stringify({ positionId }) }), "Rebalancing…")} className="btn btn-secondary btn-sm">
          RESET TO TARGET
        </button>
        <button type="button" disabled={!!step || opening} onClick={openWithdraw} className="btn btn-secondary btn-sm">
          WITHDRAW AS TOKENS
        </button>
      </div>
      {opening && !chains && (
        <Loading label="Checking where each token can go" className="well grid gap-3 p-4">
          <Skeleton className="h-2.5 w-4/5" />
          {[0, 1].map((i) => (
            <div key={i} className="grid gap-1">
              <Skeleton className="h-2.5 w-40" />
              <Skeleton className="h-11 w-full rounded-[var(--r-sm)]" />
            </div>
          ))}
          <Skeleton className="h-11 w-full rounded-full" />
        </Loading>
      )}
      {chains && (
        <div className="well grid gap-3 p-4">
          <p className="fine">Tokens leave Stonkbag tracking and land in your own wallets. Ondo stock tokens go to BNB Chain.</p>
          {Object.entries(chains).map(([c, ids]) => (
            <label key={c} className="field">
              <span className="label">
                {CHAIN_NAMES[c] ?? c} address · {ids.join(", ")}
              </span>
              <input id={`wd-${positionId}-${c}`} value={addr[c] ?? ""} onChange={(e) => setAddr((a) => ({ ...a, [c]: e.target.value.trim() }))} className="input num text-xs" />
            </label>
          ))}
          <button
            type="button"
            disabled={!!step || Object.keys(chains).some((c) => !addr[c])}
            onClick={() => run(() => api<OrderView>("/api/orders/withdraw", { method: "POST", body: JSON.stringify({ positionId, addresses: addr }) }), "Withdrawing…")}
            className="btn btn-primary btn-block"
          >
            WITHDRAW EVERYTHING
          </button>
        </div>
      )}
      {view && (
        <div className="well grid gap-2 p-3">
          {view.legs.map((l) => (
            <div key={l.seq} className="num flex justify-between text-xs">
              <span className="text-muted">{view.order.kind === "withdraw" ? `To ${l.recipient?.slice(0, 10)}…` : `Swap ${l.seq + 1}`}</span>
              <span className={l.status === "success" ? "text-gain" : ["refunded", "failed"].includes(l.status) ? "text-loss" : "text-muted"}>{l.status}</span>
            </div>
          ))}
        </div>
      )}
      {err && <p className="callout callout-warn text-xs text-loss">{err}</p>}
      {step && (
        <p className="num flex items-center gap-2 text-xs text-accent">
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-accent/30 border-t-accent" aria-hidden />
          {step}
        </p>
      )}
    </div>
  );
}
