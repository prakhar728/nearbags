"use client";
// Share a position's P&L as an image card + link. The server computes the numbers and signs a snapshot; dollars are
// left out unless the owner ticks the box.
import { useRef, useState } from "react";
import { ShareIcon, shareUrl, xIntent } from "./ShareBasket";

export function SharePnl({ positionId, basketName, compact = false }: { positionId: number; basketName: string; compact?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [showAmount, setShowAmount] = useState(false);
  const [made, setMade] = useState<{ path: string; image: string; key: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function make(amount: boolean) {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/share/pnl", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ positionId, showAmount: amount }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Couldn't make the card.");
      setMade({ ...j, key: `${positionId}:${amount}` });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function openDialog(e: React.MouseEvent) {
    e.stopPropagation();
    dialog.current?.showModal();
    if (!made) void make(showAmount);
  }

  const url = made ? shareUrl(made.path) : "";
  const canNative = typeof navigator !== "undefined" && typeof navigator.share === "function";

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className={`inline-flex items-center gap-2 rounded-full border border-border bg-surface font-mono text-xs text-text transition hover:border-border-strong active:scale-[0.98] ${compact ? "min-h-[32px] px-3" : "min-h-[40px] px-4"}`}
      >
        <ShareIcon /> {compact ? "SHARE" : "SHARE P&L"}
      </button>
      <dialog
        ref={dialog}
        onClick={(e) => {
          e.stopPropagation();
          if (e.target === dialog.current) dialog.current?.close();
        }}
        className="m-auto w-[min(640px,calc(100vw-32px))] rounded-3xl border border-border bg-surface p-0 text-text backdrop:bg-black/70 backdrop:backdrop-blur-sm"
      >
        <div className="grid gap-4 p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold">Share your {basketName} bag</h2>
            <button type="button" onClick={() => dialog.current?.close()} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-bg hover:text-text">
              ✕
            </button>
          </div>

          <div className="relative aspect-[1200/630] overflow-hidden rounded-2xl border border-border bg-bg">
            {made && !busy ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={made.key} src={made.image} alt={`P&L card for ${basketName}`} className="h-full w-full object-cover" />
            ) : (
              <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-surface to-bg motion-reduce:animate-none" />
            )}
          </div>

          <label className="flex min-h-[44px] cursor-pointer items-center gap-3 text-sm text-muted">
            <input
              type="checkbox"
              checked={showAmount}
              onChange={(e) => {
                setShowAmount(e.target.checked);
                void make(e.target.checked);
              }}
              className="h-4 w-4 accent-[var(--color-accent,#e8ff59)]"
            />
            Show the dollar amount (off: only the percentage)
          </label>

          {err && <p className="text-xs text-loss">{err}</p>}

          <div className="grid gap-2 sm:grid-cols-3">
            <a
              href={made ? xIntent(`My ${basketName} bag on Stonkbag`, url) : undefined}
              target="_blank"
              rel="noopener noreferrer"
              aria-disabled={!made}
              className={`grid min-h-[44px] place-items-center rounded-full bg-accent px-4 font-mono text-xs font-semibold text-accent-ink transition hover:brightness-110 ${made ? "" : "pointer-events-none opacity-40"}`}
            >
              POST ON X
            </a>
            <button
              type="button"
              disabled={!made}
              onClick={async () => {
                await navigator.clipboard.writeText(url).catch(() => {});
                setCopied(true);
                setTimeout(() => setCopied(false), 1600);
              }}
              className="min-h-[44px] rounded-full border border-border px-4 font-mono text-xs transition hover:border-border-strong disabled:opacity-40"
            >
              {copied ? "COPIED" : "COPY LINK"}
            </button>
            {canNative ? (
              <button
                type="button"
                disabled={!made}
                onClick={() => navigator.share({ title: `My ${basketName} bag`, url }).catch(() => {})}
                className="min-h-[44px] rounded-full border border-border px-4 font-mono text-xs transition hover:border-border-strong disabled:opacity-40"
              >
                SHARE…
              </button>
            ) : (
              <a
                href={made ? `${made.image}?download=1` : undefined}
                aria-disabled={!made}
                className={`grid min-h-[44px] place-items-center rounded-full border border-border px-4 font-mono text-xs transition hover:border-border-strong ${made ? "" : "pointer-events-none opacity-40"}`}
              >
                DOWNLOAD IMAGE
              </a>
            )}
          </div>
          <p className="text-[11px] text-faint">The link shows a snapshot from now. It won&apos;t update, and it never shows your wallet&apos;s other holdings.</p>
        </div>
      </dialog>
    </>
  );
}
