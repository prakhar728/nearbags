"use client";
// Sell 25/50/75/100% of a basket position, paid out in any token on any chain (spec §5.5). No fees on sells.
import { useEffect, useMemo, useState } from "react";
import { Skeleton } from "@/components/ui/Skeleton";
import { ASSETS } from "@/lib/assets";
import { useAuth } from "@/lib/client/auth";
import { driveOrder } from "@/lib/client/order-runner";
import type { PayToken } from "@/lib/client/pay";
import type { OrderView } from "@/lib/trade/orders";

const CHAIN_NAMES: Record<string, string> = {
  near: "NEAR", eth: "Ethereum", arb: "Arbitrum", base: "Base", op: "Optimism", pol: "Polygon", bsc: "BNB Chain",
  sol: "Solana", btc: "Bitcoin", zec: "Zcash", xrp: "XRP Ledger", doge: "Dogecoin", sui: "Sui", tron: "Tron",
};
const EVM = new Set(["eth", "arb", "base", "op", "pol", "bsc"]);

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) }, cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? `Request failed (${r.status})`);
  return j as T;
}

const PCTS = [25, 50, 75, 100];

/** The asset that stops a partial sell: some leg would fall under 1Click's minimum swap for that asset. */
function blockerFor(pct: number, holdings: { assetId: string; valueUsd: number }[]) {
  if (pct === 100) return null;
  for (const h of holdings) {
    const min = ASSETS.find((a) => a.id === h.assetId)?.minLegUsd ?? 0;
    const leg = (h.valueUsd * pct) / 100;
    if (leg > 0.01 && leg < min) return { assetId: h.assetId, leg, min };
  }
  return null;
}

export function SellPanel({ positionId, basketId, holdings = [], onDone }: { positionId: number; basketId: number; holdings?: { assetId: string; valueUsd: number }[]; onDone?: () => void }) {
  const { user, keyForBasket } = useAuth();
  const [tokens, setTokens] = useState<PayToken[]>([]);
  const [pct, setPct] = useState(100);
  const [payout, setPayout] = useState("");
  const [address, setAddress] = useState("");
  const [view, setView] = useState<OrderView | null>(null);
  const [step, setStep] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api<{ tokens: PayToken[] }>("/api/pay-tokens").then(({ tokens }) => {
      setTokens(tokens);
      const def = tokens.find((t) => t.symbol === "USDC" && t.chain === (user?.chain === "near" ? "near" : "arb")) ?? tokens[0];
      if (def) setPayout((c) => c || def.assetId);
    });
  }, [user?.chain]);

  const token = tokens.find((t) => t.assetId === payout);
  const defaultAddr = useMemo(() => {
    if (!user || !token) return "";
    if (user.chain === "evm" && EVM.has(token.chain)) return user.address;
    if (user.chain === "near" && token.chain === "near") return user.address;
    return "";
  }, [user, token]);
  const to = address || defaultAddr;

  async function sell() {
    if (!user || !token) return;
    setErr(null);
    try {
      setStep("Unlocking your basket key…");
      const { k } = await keyForBasket(basketId);
      setStep("Quoting every asset…");
      const v = await api<OrderView>("/api/orders/sell", { method: "POST", body: JSON.stringify({ positionId, pct, payoutAssetId: token.assetId, payoutAddress: to }) });
      setView(v);
      setStep("Selling…");
      const final = await driveOrder(v.order.id, k, { onUpdate: setView });
      setStep(null);
      if (final.order.status === "complete") onDone?.();
    } catch (e) {
      setStep(null);
      setErr((e as Error).message);
    }
  }

  return (
    <div className="grid gap-3">
      <div className="flex gap-2">
        {PCTS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPct(p)}
            disabled={!!blockerFor(p, holdings)}
            className={`num flex-1 border px-2 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-30 ${pct === p ? "border-accent text-accent" : "border-border text-muted hover:border-border-strong"}`}
          >
            {p}%
          </button>
        ))}
      </div>
      {blockerFor(25, holdings) && (
        <p className="num text-[11px] text-faint">
          {blockerFor(25, holdings)!.assetId} trades in swaps of at least ${blockerFor(25, holdings)!.min}, so this bag can be sold{" "}
          {PCTS.filter((p) => !blockerFor(p, holdings)).length === 1 ? "only in full" : `in ${PCTS.filter((p) => !blockerFor(p, holdings)).map((p) => `${p}%`).join(", ")} steps`}.
        </p>
      )}
      {tokens.length ? (
        <select id={`sell-token-${positionId}`} value={payout} onChange={(e) => (setPayout(e.target.value), setAddress(""))} className="num border border-border bg-bg px-3 py-2 text-sm">
          {tokens.map((t) => (
            <option key={t.assetId} value={t.assetId}>
              Receive {t.symbol} on {CHAIN_NAMES[t.chain] ?? t.chain}
            </option>
          ))}
        </select>
      ) : (
        <div role="status" className="flex h-[38px] items-center border border-border px-3">
          <span className="sr-only">Loading payout tokens</span>
          <Skeleton className="h-3 w-40" />
        </div>
      )}
      {token && !defaultAddr && (
        <input id={`sell-addr-${positionId}`} placeholder={`Your ${CHAIN_NAMES[token.chain] ?? token.chain} address`} value={address} onChange={(e) => setAddress(e.target.value.trim())} className="num border border-border bg-bg px-3 py-2 text-xs" />
      )}
      {view && (
        <div className="grid gap-1">
          {view.legs.map((l) => (
            <div key={l.seq} className="num flex justify-between text-xs">
              <span className="text-muted">{l.isPayout ? "Payout" : `Swap ${l.seq + 1}`}</span>
              <span className={l.status === "success" ? "text-gain" : ["refunded", "failed"].includes(l.status) ? "text-loss" : "text-muted"}>{l.status}</span>
            </div>
          ))}
        </div>
      )}
      {err && <p className="text-xs text-loss">{err}</p>}
      {step && <p className="num text-xs text-accent">{step}</p>}
      <button type="button" disabled={!token || !to || !!step} onClick={sell} className="border border-border-strong px-4 py-2 font-mono text-xs font-semibold hover:border-text disabled:opacity-40">
        DUMP {pct}%
      </button>
      <p className="text-[11px] text-faint">No fees on selling. Only the swap cost.</p>
    </div>
  );
}
