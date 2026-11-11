"use client";
// Token + network picker, near.com style: two rows (Token, Network), each opening a sheet with logos, search and the
// wallet's balances. Replaces the long "USDT on Ethereum…" dropdown in Buy (pay with) and Sell (receive in).
import { useMemo, useRef, useState } from "react";
import type { PayToken } from "@/lib/client/pay";
import type { Holding } from "@/lib/client/balances";
import { ChainLogo, TokenLogo } from "./ChainLogos";

export const CHAIN_NAMES: Record<string, string> = {
  near: "NEAR", eth: "Ethereum", arb: "Arbitrum", base: "Base", op: "Optimism", pol: "Polygon", bsc: "BNB Chain",
  sol: "Solana", btc: "Bitcoin", zec: "Zcash", xrp: "XRP Ledger", doge: "Dogecoin", sui: "Sui", tron: "Tron",
};
const TOKEN_NAMES: Record<string, string> = {
  USDC: "USD Coin", USDT: "Tether", ETH: "Ether", BTC: "Bitcoin", SOL: "Solana", wNEAR: "NEAR", ZEC: "Zcash",
  BNB: "BNB", XRP: "XRP", DOGE: "Dogecoin", SUI: "Sui", TRX: "Tron",
};
// Order for tokens the wallet doesn't hold: stablecoins first, then by how common they are to pay with.
const RANK = ["USDC", "USDT", "ETH", "wNEAR", "BTC", "SOL", "BNB", "ZEC", "SUI", "XRP", "DOGE", "TRX"];
const CHAIN_RANK = ["near", "base", "arb", "eth", "op", "pol", "bsc", "sol", "btc", "zec", "sui", "xrp", "doge", "tron"];

const amt = (x: number) => x.toLocaleString(undefined, { maximumFractionDigits: x < 1 ? 6 : 4 });
const money = (x: number) => `$${x.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export interface TokenPickerProps {
  tokens: PayToken[];
  value: string; // assetId
  onChange: (assetId: string) => void;
  /** Buy: tokens the connected wallet can pay directly; the rest are paid by sending to a deposit address. */
  canPayFrom?: (t: PayToken) => boolean;
  balances?: Map<string, Holding>;
  label?: (t: PayToken) => string;
  mode?: "pay" | "receive";
  idPrefix?: string;
}

export function TokenPicker({ tokens, value, onChange, canPayFrom, balances, label = (t) => t.symbol, mode = "pay", idPrefix = "pay" }: TokenPickerProps) {
  const tokenSheet = useRef<HTMLDialogElement>(null);
  const chainSheet = useRef<HTMLDialogElement>(null);
  const [q, setQ] = useState("");
  const current = tokens.find((t) => t.assetId === value);

  // One entry per symbol, with every network it exists on and the wallet's total across them.
  const symbols = useMemo(() => {
    const m = new Map<string, { symbol: string; list: PayToken[]; usd: number }>();
    for (const t of tokens) {
      const e = m.get(t.symbol) ?? m.set(t.symbol, { symbol: t.symbol, list: [], usd: 0 }).get(t.symbol)!;
      e.list.push(t);
      e.usd += balances?.get(t.assetId)?.usd ?? 0;
    }
    const rank = (s: string) => (RANK.indexOf(s) < 0 ? 99 : RANK.indexOf(s));
    return [...m.values()].sort((a, b) => b.usd - a.usd || rank(a.symbol) - rank(b.symbol));
  }, [tokens, balances]);

  const networksOf = (symbol: string) => {
    const list = tokens.filter((t) => t.symbol === symbol);
    const rank = (c: string) => (CHAIN_RANK.indexOf(c) < 0 ? 99 : CHAIN_RANK.indexOf(c));
    return list.sort(
      (a, b) =>
        (balances?.get(b.assetId)?.usd ?? 0) - (balances?.get(a.assetId)?.usd ?? 0) ||
        Number(canPayFrom?.(b) ?? 0) - Number(canPayFrom?.(a) ?? 0) ||
        rank(a.chain) - rank(b.chain),
    );
  };

  const pickSymbol = (symbol: string) => {
    tokenSheet.current?.close();
    setQ("");
    if (current?.symbol === symbol) return;
    // Keep the network if this token exists there; else the best one (held, then payable, then most common).
    const same = tokens.find((t) => t.symbol === symbol && t.chain === current?.chain);
    onChange((same ?? networksOf(symbol)[0]).assetId);
  };

  const shown = symbols.filter((s) => !q || `${s.symbol} ${TOKEN_NAMES[s.symbol] ?? ""}`.toLowerCase().includes(q.toLowerCase()));
  const held = balances ? shown.filter((s) => s.usd > 0) : [];
  const rest = shown.filter((s) => !held.includes(s));
  const display = (s: { symbol: string; list: PayToken[] }) => label(s.list[0]);

  return (
    <div className="grid gap-2">
      <Row id={`${idPrefix}-token`} caption="Token" onClick={() => tokenSheet.current?.showModal()}>
        {current ? <TokenLogo symbol={current.symbol} /> : null}
        <span className="font-medium text-text">{current ? label(current) : "Choose"}</span>
      </Row>
      <Row id={`${idPrefix}-network`} caption="Network" onClick={() => chainSheet.current?.showModal()}>
        {current ? <ChainLogo chain={current.chain} /> : null}
        <span className="font-medium text-text">{current ? (CHAIN_NAMES[current.chain] ?? current.chain) : "Choose"}</span>
        {current && mode === "pay" && canPayFrom && !canPayFrom(current) && <span className="badge ml-1 normal-case tracking-normal">send to address</span>}
      </Row>

      <Sheet ref={tokenSheet} title={mode === "pay" ? "Pay with" : "Receive"} onClose={() => setQ("")}>
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search tokens"
          aria-label="Search tokens"
          className="input mb-2"
        />
        {held.length > 0 && <Group>Your tokens</Group>}
        {held.map((s) => (
          <Item key={s.symbol} onClick={() => pickSymbol(s.symbol)} on={current?.symbol === s.symbol}>
            <TokenLogo symbol={s.symbol} size={36} />
            <Two top={display(s)} sub={TOKEN_NAMES[s.symbol] ?? s.symbol} />
            <Two right top={money(s.usd)} sub={amt(s.list.reduce((a, t) => a + (balances?.get(t.assetId)?.amount ?? 0), 0))} />
          </Item>
        ))}
        {rest.length > 0 && <Group>{held.length ? "Other tokens" : "Tokens"}</Group>}
        {rest.map((s) => (
          <Item key={s.symbol} onClick={() => pickSymbol(s.symbol)} on={current?.symbol === s.symbol}>
            <TokenLogo symbol={s.symbol} size={36} />
            <Two top={display(s)} sub={TOKEN_NAMES[s.symbol] ?? s.symbol} />
            <span className="text-xs text-faint">
              {s.list.length} network{s.list.length > 1 ? "s" : ""}
            </span>
          </Item>
        ))}
        {shown.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted">No token matches &ldquo;{q}&rdquo;.</p>}
      </Sheet>

      <Sheet ref={chainSheet} title={current ? `Network for ${label(current)}` : "Network"}>
        {current &&
          (() => {
            const list = networksOf(current.symbol);
            const direct = canPayFrom ? list.filter((t) => canPayFrom(t)) : list;
            const send = canPayFrom ? list.filter((t) => !canPayFrom(t)) : [];
            const item = (t: PayToken) => {
              const h = balances?.get(t.assetId);
              return (
                <Item
                  key={t.assetId}
                  on={t.assetId === value}
                  onClick={() => {
                    chainSheet.current?.close();
                    onChange(t.assetId);
                  }}
                >
                  <ChainLogo chain={t.chain} size={36} />
                  <Two top={CHAIN_NAMES[t.chain] ?? t.chain} sub={`${label(t)} on ${CHAIN_NAMES[t.chain] ?? t.chain}`} />
                  {h ? <Two right top={money(h.usd)} sub={amt(h.amount)} /> : null}
                </Item>
              );
            };
            return (
              <>
                {mode === "pay" && canPayFrom && direct.length > 0 && <Group>Pay from your wallet</Group>}
                {direct.map(item)}
                {send.length > 0 && <Group>Send from any wallet (we show you an address)</Group>}
                {send.map(item)}
              </>
            );
          })()}
      </Sheet>
    </div>
  );
}

function Row({ id, caption, onClick, children }: { id: string; caption: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button id={id} type="button" onClick={onClick} className="input flex h-auto min-h-[56px] items-center gap-3 py-2 text-left">
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[11px] text-faint">{caption}</span>
        <span className="flex items-center gap-2 text-sm">{children}</span>
      </span>
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden className="shrink-0 text-faint">
        <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

function Sheet({ ref, title, children, onClose }: { ref: React.Ref<HTMLDialogElement>; title: string; children: React.ReactNode; onClose?: () => void }) {
  return (
    <dialog
      ref={ref}
      className="sheet"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) e.currentTarget.close();
      }}
    >
      <div className="flex max-h-[80dvh] flex-col">
        <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-4">
          <h2 className="text-base font-semibold">{title}</h2>
          <button type="button" aria-label="Close" className="btn btn-ghost btn-sm w-10 !px-0" onClick={(e) => (e.currentTarget.closest("dialog") as HTMLDialogElement).close()}>
            ✕
          </button>
        </div>
        <div className="overflow-y-auto px-3 pb-4">{children}</div>
      </div>
    </dialog>
  );
}

const Group = ({ children }: { children: React.ReactNode }) => <div className="px-3 pb-1 pt-3 text-[11px] text-faint">{children}</div>;

function Item({ children, onClick, on }: { children: React.ReactNode; onClick: () => void; on?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`flex w-full items-center gap-3 rounded-[var(--r-md)] px-3 py-2.5 text-left transition-colors hover:bg-[var(--surface)] ${on ? "bg-[var(--surface)]" : ""}`}
    >
      {children}
    </button>
  );
}

function Two({ top, sub, right }: { top: React.ReactNode; sub: React.ReactNode; right?: boolean }) {
  return (
    <span className={`flex min-w-0 flex-col ${right ? "ml-auto items-end text-right" : "flex-1"}`}>
      <span className="num text-sm font-medium text-text">{top}</span>
      <span className="num truncate text-xs text-faint">{sub}</span>
    </span>
  );
}
