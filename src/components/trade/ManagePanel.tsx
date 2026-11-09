"use client";
// Reset to target weights and withdraw-as-tokens for one position (spec §5.6, §5.7).
import { useState } from "react";
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
    }
  };

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={!!step} onClick={() => run(() => api<OrderView>("/api/orders/reset", { method: "POST", body: JSON.stringify({ positionId }) }), "Rebalancing…")} className="border border-border px-3 py-1.5 font-mono text-xs hover:border-border-strong disabled:opacity-40">
          RESET TO TARGET
        </button>
        <button type="button" disabled={!!step} onClick={openWithdraw} className="border border-border px-3 py-1.5 font-mono text-xs hover:border-border-strong disabled:opacity-40">
          WITHDRAW AS TOKENS
        </button>
      </div>
      {chains && (
        <div className="grid gap-2 border border-border p-3">
          <p className="text-[11px] text-faint">Tokens leave Stonkbag tracking and land in your own wallets. Ondo stock tokens go to BNB Chain.</p>
          {Object.entries(chains).map(([c, ids]) => (
            <label key={c} className="grid gap-1">
              <span className="font-mono text-[10px] uppercase tracking-wider text-faint">
                {CHAIN_NAMES[c] ?? c} address · {ids.join(", ")}
              </span>
              <input id={`wd-${positionId}-${c}`} value={addr[c] ?? ""} onChange={(e) => setAddr((a) => ({ ...a, [c]: e.target.value.trim() }))} className="num border border-border bg-bg px-3 py-2 text-xs" />
            </label>
          ))}
          <button
            type="button"
            disabled={!!step || Object.keys(chains).some((c) => !addr[c])}
            onClick={() => run(() => api<OrderView>("/api/orders/withdraw", { method: "POST", body: JSON.stringify({ positionId, addresses: addr }) }), "Withdrawing…")}
            className="border border-border-strong px-3 py-2 font-mono text-xs font-semibold hover:border-text disabled:opacity-40"
          >
            WITHDRAW EVERYTHING
          </button>
        </div>
      )}
      {view && (
        <div className="grid gap-1">
          {view.legs.map((l) => (
            <div key={l.seq} className="num flex justify-between text-xs">
              <span className="text-muted">{view.order.kind === "withdraw" ? `To ${l.recipient?.slice(0, 10)}…` : `Swap ${l.seq + 1}`}</span>
              <span className={l.status === "success" ? "text-gain" : ["refunded", "failed"].includes(l.status) ? "text-loss" : "text-muted"}>{l.status}</span>
            </div>
          ))}
        </div>
      )}
      {err && <p className="text-xs text-loss">{err}</p>}
      {step && <p className="num text-xs text-accent">{step}</p>}
    </div>
  );
}
