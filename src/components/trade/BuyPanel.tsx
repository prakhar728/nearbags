"use client";
// Buy panel for a basket page (spec §5.4). The basket page only mounts it:
//   <BuyPanel basket={{ id, slug, name, feeBps, minBuyUsd, status, assets }} />
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useConfig } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/Skeleton";
import { ASSETS, getAsset } from "@/lib/assets";
import { useAuth } from "@/lib/client/auth";
import { driveOrder, retryLeg } from "@/lib/client/order-runner";
import { canPayFromEvm, canPayFromNear, nearBalance, nearFtBalance, payFromEvm, payFromNear, type PayToken } from "@/lib/client/pay";
import type { BasketKey } from "@/lib/intents/keys";
import { signIntents } from "@/lib/intents/payload";
import type { BuyPreflight } from "@/lib/trade/preflight";
import type { OrderView } from "@/lib/trade/orders";
import type { WeightInput } from "@/lib/trade/types";
import { AssetTag } from "@/components/AssetLogo";

export interface BuyPanelBasket {
  id: number;
  slug: string;
  name: string;
  feeBps: number;
  minBuyUsd: number;
  status: "draft" | "pending" | "live" | "closed" | "hidden";
  assets: WeightInput[];
  agentManaged?: boolean;
}

type Phase = "form" | "review" | "working" | "order";

const CHAIN_NAMES: Record<string, string> = {
  near: "NEAR", eth: "Ethereum", arb: "Arbitrum", base: "Base", op: "Optimism", pol: "Polygon", bsc: "BNB Chain",
  sol: "Solana", btc: "Bitcoin", zec: "Zcash", xrp: "XRP Ledger", doge: "Dogecoin", sui: "Sui", tron: "Tron",
};
const EVM = new Set(["eth", "arb", "base", "op", "pol", "bsc"]);
const usd = (x: number) => `$${x.toFixed(2)}`;
const units = (amount: string, decimals: number) => Number(amount) / 10 ** decimals;
const symbolOf = (intentsId: string) => ASSETS.find((a) => a.intentsAssetId === intentsId)?.id ?? "?";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) }, cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? `Request failed (${r.status})`);
  return j as T;
}

export function BuyPanel({ basket }: { basket: BuyPanelBasket }) {
  const { user, keyForBasket, signInNear, busy: authBusy } = useAuth();
  const wagmiConfig = useConfig();
  const [tokens, setTokens] = useState<PayToken[]>([]);
  const [amount, setAmount] = useState(String(Math.max(basket.minBuyUsd, 20)));
  const [payAsset, setPayAsset] = useState("");
  const [refund, setRefund] = useState("");
  const [phase, setPhase] = useState<Phase>("form");
  const [pre, setPre] = useState<BuyPreflight | null>(null);
  const [view, setView] = useState<OrderView | null>(null);
  const [step, setStep] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [legErrs, setLegErrs] = useState<Record<number, string>>({});
  const router = useRouter();
  const doneStatus = view?.order.status;
  // A finished buy can change what the server renders (a creator's first buy takes the basket live, holdings and
  // TVL move), so re-render the page around the panel.
  useEffect(() => {
    if (doneStatus === "complete" || doneStatus === "partial") router.refresh();
  }, [doneStatus, router]);
  const keyRef = useRef<BasketKey | null>(null);
  const pickedToken = useRef(false); // the buyer chose a pay token; stop re-defaulting it
  const runRef = useRef<AbortController | null>(null);

  const token = tokens.find((t) => t.assetId === payAsset);
  const canPayFrom = useCallback(
    (t: PayToken) => (user?.chain === "near" ? canPayFromNear(t) : user?.chain === "evm" ? canPayFromEvm(t) : false),
    [user?.chain],
  );
  // NEAR wallets pay wNEAR by wrapping native NEAR on the fly, so show it as NEAR.
  const tokenLabel = (t: PayToken) => (user?.chain === "near" && t.contract === "wrap.near" ? "NEAR" : t.symbol);
  const balance = useQuery({
    queryKey: ["near-balance", user?.address, token?.assetId],
    enabled: user?.chain === "near" && !!token && canPayFromNear(token),
    staleTime: 30_000,
    queryFn: async () => {
      const t = token!;
      const raw = await nearFtBalance(t.contract!, user!.address);
      const f = (x: bigint, d: number) => (Number(x) / 10 ** d).toLocaleString(undefined, { maximumFractionDigits: 4 });
      if (t.contract !== "wrap.near") return `${f(raw, t.decimals)} ${t.symbol}`;
      const native = await nearBalance(user!.address);
      return `${f(native, 24)} NEAR${raw > 0n ? ` + ${f(raw, 24)} wNEAR` : ""}`;
    },
  });
  const amountNum = Number(amount);

  const elig = useQuery({
    queryKey: ["eligibility", basket.id, user?.id ?? 0],
    queryFn: () => api<{ status: "ok" | "needs" | "blocked"; needs: string[]; reason?: string; text: Record<string, string> }>(`/api/eligibility?basketId=${basket.id}`),
    staleTime: 60_000,
  });

  useEffect(() => {
    api<{ tokens: PayToken[] }>("/api/pay-tokens")
      .then(({ tokens }) => {
        setTokens(tokens);
        const def = tokens.find((t) => t.symbol === "USDC" && t.chain === (user?.chain === "near" ? "near" : "arb")) ?? tokens[0];
        if (def) setPayAsset((cur) => (pickedToken.current && cur ? cur : def.assetId));
      })
      .catch(() => setErr("Couldn't load payment tokens."));
  }, [user?.chain]);

  // Refund address defaults to the signed-in wallet when the pay chain matches its family.
  const defaultRefund = useMemo(() => {
    if (!user || !token) return "";
    if (user.chain === "evm" && EVM.has(token.chain)) return user.address;
    if (user.chain === "near" && token.chain === "near") return user.address;
    return "";
  }, [user, token]);
  const refundAddress = refund || defaultRefund;

  const keyFor = useCallback(async () => {
    if (!user) throw new Error("Sign in first.");
    const { k, mode } = await keyForBasket(basket.id);
    keyRef.current = k;
    return { k, mode };
  }, [user, keyForBasket, basket.id]);

  const run = useCallback(async (orderId: number, k: BasketKey) => {
    runRef.current?.abort();
    const ac = new AbortController();
    runRef.current = ac;
    try {
      await driveOrder(orderId, k, {
        onUpdate: setView,
        signal: ac.signal,
        onLegError: (seq, msg) =>
          setLegErrs((m) => {
            const next = { ...m };
            if (msg) next[seq] = msg;
            else delete next[seq];
            return next;
          }),
      });
    } catch (e) {
      if ((e as Error).name !== "AbortError") setErr((e as Error).message);
    }
  }, []);

  // Resume an open order for this basket after a reload.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    api<{ open: OrderView | null }>(`/api/orders?basketId=${basket.id}`)
      .then(async ({ open }) => {
        if (cancelled || !open) return;
        setView(open);
        setPhase("order");
        if (open.next !== "deposit" || user.keyMode) {
          const { k } = await keyFor();
          if (!cancelled) void run(open.order.id, k);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      runRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, basket.id]);

  async function check() {
    setErr(null);
    setStep("Quoting every asset…");
    try {
      const r = await api<BuyPreflight & { minBuyUsd: number }>("/api/orders/preflight", {
        method: "POST",
        body: JSON.stringify({ weights: basket.assets, usd: amountNum, creatorFeeBps: basket.feeBps }),
      });
      setPre(r);
      setPhase("review");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setStep(null);
    }
  }

  async function buy() {
    if (!user || !token) return;
    setErr(null);
    setPhase("working");
    try {
      setStep("Unlocking your basket key…");
      const { k, mode } = await keyFor();
      setStep("Registering your basket account…");
      const { position } = await api<{ position: { recoveryKeyAddedAt: string | null; agentKeyAddedAt?: string | null } }>("/api/positions", {
        method: "POST",
        body: JSON.stringify({ basketId: basket.id, accountId: k.accountId, keyMode: mode }),
      });
      if (!position.recoveryKeyAddedAt) {
        if (!user.walletPubkey) throw new Error("No wallet key on file. Sign out and in again.");
        setStep("Adding your wallet as the recovery key…");
        await api("/api/relay/recovery", { method: "POST", body: JSON.stringify({ signed: signIntents(k, [{ intent: "add_public_key", public_key: user.walletPubkey }]) }) });
      }
      if (basket.agentManaged && !position.agentKeyAddedAt) {
        // Agent-managed basket: the agent's key joins the account so it can rebalance it (swaps only, checked in its code).
        const { key } = await api<{ key: { publicKey: string } | null }>("/api/agent/key");
        if (!key) throw new Error("This basket's agent isn't set up yet. Try again later.");
        setStep("Letting the agent manage this basket…");
        await api("/api/relay/agent", { method: "POST", body: JSON.stringify({ signed: signIntents(k, [{ intent: "add_public_key", public_key: key.publicKey }]) }) });
      }
      setStep("Getting a deposit address…");
      const v = await api<OrderView>("/api/orders", {
        method: "POST",
        body: JSON.stringify({ basketId: basket.id, usd: amountNum, payAssetId: token.assetId, refundAddress }),
      });
      setView(v);
      setPhase("order");
      void run(v.order.id, k);
    } catch (e) {
      setErr((e as Error).message);
      setPhase("review");
    } finally {
      setStep(null);
    }
  }

  async function payNow() {
    if (!view?.order.deposit || !token) return;
    setErr(null);
    try {
      setStep("Confirm the transfer in your wallet…");
      if (user?.chain === "near" && canPayFromNear(token)) {
        await payFromNear(user.address, token, view.order.deposit.address!, view.order.deposit.amountIn);
      } else {
        await payFromEvm(wagmiConfig, token, view.order.deposit.address!, view.order.deposit.amountIn);
      }
      setStep("Sent. Waiting for it to arrive…");
    } catch (e) {
      setStep(null);
      setErr((e as Error).message.split("\n")[0]);
    }
  }

  async function retry(seq: number) {
    if (!view || !keyRef.current) return;
    setErr(null);
    try {
      await retryLeg(view.order.id, seq, keyRef.current);
      setLegErrs((m) => {
        const next = { ...m };
        delete next[seq];
        return next;
      });
      void run(view.order.id, keyRef.current);
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  // ---------- render ----------
  if (basket.status === "closed" || basket.status === "hidden") {
    return <Box title="Buy"><p className="text-sm text-muted">Closed to new buyers. Holders can still sell.</p></Box>;
  }
  if (elig.data?.status === "blocked") {
    return <Box title="Buy"><p className="text-sm text-muted">{elig.data.reason}</p></Box>;
  }
  if (!user) {
    return (
      <Box title="Buy">
        <p className="num text-sm text-muted">Minimum ${basket.minBuyUsd}. Pay with any token on any chain.</p>
        <button type="button" onClick={signInNear} className="btn btn-primary btn-block mt-4">
          Connect to buy
        </button>
        <p className="fine mt-3 text-center">EVM wallets: use Connect in the top bar.</p>
      </Box>
    );
  }

  const walletCanPay = !!token && (user?.chain === "near" ? canPayFromNear(token) : canPayFromEvm(token));
  // "Sent. Waiting for it to arrive…" belongs to the deposit step only.
  const orderStep = step?.startsWith("Sent.") && view && view.order.status !== "awaiting_deposit" ? null : step;
  if (phase === "order" && view) return <OrderBox view={view} token={token} canPay={walletCanPay} onPay={payNow} onRetry={retry} step={orderStep} err={err} legErrs={legErrs} />;

  if (elig.data?.status === "needs") {
    return <Attest needs={elig.data.needs} text={elig.data.text} onDone={() => void elig.refetch()} />;
  }

  const tooSmall = amountNum < basket.minBuyUsd;
  const tooBig = amountNum > 1000;

  return (
    <Box title="Buy">
      <div className="grid gap-4">
        <label className="field">
          <span className="label">Amount (USD)</span>
          <input
            id="buy-amount"
            inputMode="decimal"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value.replace(/[^0-9.]/g, ""));
              setPhase("form");
            }}
            className="input input-lg"
          />
          <span className={`num text-[11px] ${tooSmall || tooBig ? "text-loss" : "text-faint"}`}>
            Minimum ${basket.minBuyUsd} · maximum $1,000
          </span>
        </label>

        <label className="field">
          <span className="label">Pay with</span>
          {tokens.length === 0 ? (
            <div role="status" className="input flex items-center">
              <span className="sr-only">Loading payment tokens</span>
              <Skeleton className="h-3 w-40" />
            </div>
          ) : (
          <select
            id="buy-token"
            value={payAsset}
            onChange={(e) => {
              pickedToken.current = true;
              setPayAsset(e.target.value);
              setRefund("");
              setPhase("form");
            }}
            className="input num"
          >
            {[
              ["Pay from your wallet", tokens.filter((t) => canPayFrom(t))],
              ["Send from anywhere", tokens.filter((t) => !canPayFrom(t))],
            ].map(([label, list]) =>
              (list as PayToken[]).length ? (
                <optgroup key={label as string} label={label as string}>
                  {(list as PayToken[]).map((t) => (
                    <option key={t.assetId} value={t.assetId}>
                      {tokenLabel(t)} on {CHAIN_NAMES[t.chain] ?? t.chain}
                    </option>
                  ))}
                </optgroup>
              ) : null,
            )}
          </select>
          )}
          {balance.isPending && balance.fetchStatus === "fetching" && <Skeleton className="h-3 w-32" />}
          {balance.data && (
            <span className="num text-[11px] text-faint">
              In your wallet: {balance.data}
            </span>
          )}
        </label>

        {token && !defaultRefund && (
          <label className="field">
            <span className="label">Your {CHAIN_NAMES[token.chain] ?? token.chain} address for refunds</span>
            <input id="buy-refund" value={refund} onChange={(e) => setRefund(e.target.value.trim())} className="input num text-xs" />
          </label>
        )}

        {phase === "review" && pre && <Review pre={pre} usdIn={amountNum} />}

        {err && <p className="callout callout-warn text-xs text-loss">{err}</p>}
        {(step || authBusy) && (
          <p className="num flex items-center gap-2 text-xs text-accent-fg">
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-accent-fg/30 border-t-accent-fg" aria-hidden />
            {step ?? authBusy}
          </p>
        )}

        {phase !== "review" ? (
          <button
            type="button"
            disabled={!token || tooSmall || tooBig || !refundAddress || !!step}
            onClick={check}
            className="btn btn-secondary btn-block"
          >
            Check prices
          </button>
        ) : (
          <button
            type="button"
            disabled={!pre?.ok || !!step || phase !== "review"}
            onClick={buy}
            className="btn btn-primary btn-block"
          >
            Bag it · {usd(amountNum)}
          </button>
        )}
        <p className="fine">
          {basket.agentManaged ? (
            <>
              Your basket sits in its own NEAR Intents account. Buying lets this basket&rsquo;s AI agent rebalance it: its key can only swap
              between the basket&rsquo;s assets inside your account, never send funds out. Your browser key and wallet keep full control, and your
              wallet can remove the agent at any time.
            </>
          ) : (
            "Your basket sits in its own NEAR Intents account. Only your browser key and your wallet can move it."
          )}
        </p>
      </div>
    </Box>
  );
}

function Attest({ needs, text, onDone }: { needs: string[]; text: Record<string, string>; onDone: () => void }) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [err, setErr] = useState<string | null>(null);
  const all = needs.every((n) => checked[n]);
  return (
    <Box title="Before your first buy">
      <div className="grid gap-3">
        {needs.map((n) => (
          <label key={n} htmlFor={`attest-${n}`} className="flex cursor-pointer gap-3 rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--layer-1)] p-3 text-xs leading-relaxed text-muted hover:border-[var(--line-strong)]">
            <input id={`attest-${n}`} type="checkbox" checked={!!checked[n]} onChange={(e) => setChecked((c) => ({ ...c, [n]: e.target.checked }))} className="check mt-0.5" />
            <span>{text[n]}</span>
          </label>
        ))}
        {err && <p className="text-xs text-loss">{err}</p>}
        <button
          type="button"
          disabled={!all}
          onClick={async () => {
            try {
              await api("/api/eligibility", { method: "POST", body: JSON.stringify({ items: needs }) });
              onDone();
            } catch (e) {
              setErr((e as Error).message);
            }
          }}
          className="btn btn-secondary btn-block"
        >
          I agree
        </button>
      </div>
    </Box>
  );
}

function Review({ pre, usdIn }: { pre: BuyPreflight; usdIn: number }) {
  const fee = (Number(pre.fees.creatorFee) + Number(pre.fees.platformFee)) / 1e6;
  const swapCost = Math.max(0, Number(pre.fees.netUsdc) / 1e6 - pre.estValueUsd);
  return (
    <div className="well grid gap-2 p-4">
      <Row k="Creator fee" v={usd(Number(pre.fees.creatorFee) / 1e6)} />
      <Row k="Platform fee" v={usd(Number(pre.fees.platformFee) / 1e6)} />
      {/* With a blocked leg the estimate would count that leg as lost, which reads like losing the money. Nothing is charged. */}
      <Row k="Est. swap cost" v={pre.ok ? usd(swapCost) : "—"} />
      <Row k="You hold ≈" v={pre.ok ? usd(pre.estValueUsd) : "—"} strong />
      {!pre.ok && <p className="text-xs text-muted">This basket can&rsquo;t be bought until every asset can be quoted. Nothing has been charged.</p>}
      <div className="mt-1 grid gap-1.5 border-t border-[var(--line)] pt-3">
        {pre.legs.map((l) => (
          <div key={l.assetId} className="num flex justify-between text-[11px] text-muted">
            <AssetTag id={l.assetId} size={14} />
            <span className={l.ok ? (l.guard?.verdict === "warn" ? "text-accent-fg" : "") : "text-loss"}>
              {l.ok ? (l.amountOutUsd != null ? usd(l.amountOutUsd) : "—") : "blocked"}
              {l.guard && l.ok ? ` · ${(l.guard.deviation * 100).toFixed(1)}% vs market` : ""}
            </span>
          </div>
        ))}
      </div>
      {pre.blockedBy.map((b) => (
        <p key={b} className="callout callout-warn text-xs text-loss">{b}</p>
      ))}
      {pre.warnings.map((w) => (
        <p key={w} className="text-xs text-accent-fg">{w}</p>
      ))}
      {fee > 0 && usdIn > 0 && <p className="fine">Fees are {((fee / usdIn) * 100).toFixed(2)}% of the buy, paid on-chain to the creator and the platform.</p>}
    </div>
  );
}

function OrderBox({ view, token, canPay, onPay, onRetry, step, err, legErrs }: { view: OrderView; token?: PayToken; canPay: boolean; onPay: () => void; onRetry: (seq: number) => void; step: string | null; err: string | null; legErrs: Record<number, string> }) {
  const o = view.order;
  const dep = o.deposit;
  const steps: [string, "done" | "now" | "todo" | "bad"][] = [
    ["Deposit", o.status === "awaiting_deposit" ? "now" : ["refunded", "failed"].includes(o.status) && !view.legs.length ? "bad" : "done"],
    ["Fees", o.status === "awaiting_deposit" ? "todo" : o.status === "funded" ? "now" : "done"],
    ["Swaps", ["complete"].includes(o.status) ? "done" : o.status === "partial" ? "bad" : ["fees_paid", "legs_running"].includes(o.status) ? "now" : "todo"],
  ];
  return (
    <Box title={o.status === "complete" ? "Bagged" : o.status === "partial" ? "Partly bought" : o.status === "refunded" ? "Refunded" : "Buying"}>
      <ol className="grid grid-cols-3 gap-1.5">
        {steps.map(([label, st]) => (
          <li
            key={label}
            className={`flex flex-col gap-2 rounded-[var(--r-sm)] border p-2.5 font-mono text-[11px] ${
              st === "done" ? "border-gain/30 bg-[var(--gain-soft)] text-gain" : st === "now" ? "border-[var(--accent-line)] bg-[var(--accent-soft)] text-accent-fg" : st === "bad" ? "border-loss/40 bg-[var(--loss-soft)] text-loss" : "border-[var(--line)] text-faint"
            }`}
          >
            <span className={`grid h-5 w-5 place-items-center rounded-full text-[10px] ${st === "done" ? "bg-gain text-bg" : st === "now" ? "bg-accent text-accent-ink motion-safe:animate-pulse" : st === "bad" ? "bg-loss text-bg" : "border border-[var(--line-strong)]"}`}>
              {st === "done" ? "✓" : st === "bad" ? "×" : ""}
            </span>
            {label}
          </li>
        ))}
      </ol>

      {o.status === "awaiting_deposit" && dep && (
        <div className="mt-4 grid gap-3">
          <p className="text-sm">
            Send <span className="num font-semibold text-accent-fg">{dep.amountInFormatted} {token?.symbol ?? ""}</span>
            {token ? <> on {CHAIN_NAMES[token.chain] ?? token.chain}</> : null} to:
          </p>
          <Copyable value={dep.address ?? ""} />
          {dep.memo && (
            <>
              <p className="text-xs text-loss">Include this memo or the deposit is lost:</p>
              <Copyable value={dep.memo} />
            </>
          )}
          <p className="fine">
            Arrives in about {Math.max(1, Math.round((dep.timeEstimate ?? 60) / 60))} min after it confirms. Send it before {dep.deadline ? new Date(dep.deadline).toLocaleTimeString() : "the quote expires"}.
            Keep this tab open, or come back here to finish.
          </p>
          {canPay && (
            <button type="button" onClick={onPay} disabled={!!step} className="btn btn-primary btn-block">
              Pay from wallet
            </button>
          )}
        </div>
      )}

      {view.legs.length > 0 && (
        <div className="well mt-4 grid gap-2 p-3">
          {view.legs.map((l) => {
            const sym = l.isPayout ? "Payout" : symbolOf(l.assetTo);
            const tone = l.status === "success" ? "text-gain" : l.status === "refunded" || l.status === "failed" ? "text-loss" : "text-muted";
            const stuck = (l.status === "pending" || l.status === "quoted") && legErrs[l.seq];
            return (
              <div key={l.seq} className="num grid gap-1 text-xs">
                <div className="flex items-center justify-between gap-2">
                  {l.isPayout || sym === "?" ? <span>{sym}</span> : <AssetTag id={sym} size={14} />}
                  <span className={tone}>
                    {l.status === "success" && l.amountOutActual && sym !== "?" && !l.isPayout
                      ? `${units(l.amountOutActual, getAsset(sym).decimals).toPrecision(4)} ${sym}`
                      : l.status}
                    {(l.status === "refunded" || l.status === "failed" || stuck) && (
                      <button type="button" onClick={() => onRetry(l.seq)} className="btn btn-secondary btn-sm ml-2 min-h-0 px-2.5 py-1">
                        retry
                      </button>
                    )}
                  </span>
                </div>
                {stuck && <p className="text-[11px] leading-snug text-loss">{legErrs[l.seq]}</p>}
              </div>
            );
          })}
        </div>
      )}

      {o.status === "refunded" && <p className="mt-3 text-xs text-muted">The deposit swap was refunded to {o.payAsset ? "your refund address" : "you"}.</p>}
      {o.status === "complete" && (
        <Link href="/portfolio" className="btn btn-secondary btn-block mt-4">
          View portfolio
        </Link>
      )}
      {err && <p className="callout callout-warn mt-3 text-xs text-loss">{err}</p>}
      {step && (
        <p className="num mt-3 flex items-center gap-2 text-xs text-accent-fg">
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-accent-fg/30 border-t-accent-fg" aria-hidden />
          {step}
        </p>
      )}
      <p className="fine mt-4 break-all">Account {o.accountId}</p>
    </Box>
  );
}

function Copyable({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => navigator.clipboard?.writeText(value).then(() => (setCopied(true), setTimeout(() => setCopied(false), 1200))).catch(() => {})}
      className="num flex w-full items-center justify-between gap-3 break-all rounded-[var(--r-sm)] border border-[var(--line-strong)] bg-[var(--surface)] px-3.5 py-3 text-left text-xs transition-colors hover:border-[var(--accent-line)]"
    >
      <span className="min-w-0">{value}</span> <span className={`badge shrink-0 ${copied ? "badge-gain" : ""}`}>{copied ? "copied" : "copy"}</span>
    </button>
  );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="num flex justify-between text-xs">
      <span className="text-muted">{k}</span>
      <span className={strong ? "font-semibold text-accent-fg" : "text-text"}>{v}</span>
    </div>
  );
}

function Box({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card card-ticks p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="display text-2xl">{title}</div>
      </div>
      {children}
    </div>
  );
}
