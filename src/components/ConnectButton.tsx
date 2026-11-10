"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useConnect } from "wagmi";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAuth } from "@/lib/client/auth";
import { usePwa } from "@/lib/client/pwa";

const short = (a: string) => (a.length > 18 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);

/** `variant="app"` is the rounded style for app pages; the landing keeps its square default. */
export function ConnectButton({ variant = "landing" }: { variant?: "landing" | "app" }) {
  const app = variant === "app";
  const { user, loading, busy, error, signInNear, signInEvm, signOut, ensureKeys } = useAuth();
  const { connectors } = useConnect();
  const [open, setOpen] = useState(false);
  const [keysMsg, setKeysMsg] = useState<string | null>(null);
  const [keysErr, setKeysErr] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const { standalone } = usePwa();

  useEffect(() => {
    const close = (e: PointerEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  // A failed sign-in reopens the menu so the reason shows.
  const [shownErr, setShownErr] = useState(error);
  if (error !== shownErr) {
    setShownErr(error);
    if (error) setOpen(true);
  }

  // Same footprint as the button, so the header doesn't shift when the session check finishes.
  if (loading) return <Skeleton className={app ? "h-9 w-[7.5rem] rounded-full" : "h-[30px] w-[5.5rem] rounded-none"} />;

  // The generic "browser wallet" only works where a wallet injected itself (an extension, or a wallet app's browser).
  const hasInjected = typeof window !== "undefined" && "ethereum" in window;
  const evmConnectors = connectors.filter((c, i, all) => all.findIndex((x) => x.name === c.name) === i && (c.id !== "injected" || hasInjected));

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={
          app
            ? `btn btn-sm ${user ? "btn-secondary normal-case tracking-normal" : "btn-primary"}`
            : `font-mono text-xs ${user ? "border border-border px-3 py-1.5 text-text hover:border-border-strong" : "bg-accent px-3 py-1.5 font-semibold text-accent-ink"}`
        }
      >
        {user ? short(user.address) : "CONNECT"}
      </button>

      {open && (
        <div className={app ? "pop absolute right-0 z-50 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-[var(--r-lg)] border border-[var(--line-strong)] bg-[#121212]/95 p-3 text-sm shadow-[0_30px_60px_-20px_rgba(0,0,0,0.9)] backdrop-blur-xl" : "absolute right-0 z-20 mt-2 w-72 border border-border-strong bg-surface p-3 text-sm shadow-none"}>
          {busy && <p className="num mb-2 text-xs text-accent">{busy}</p>}
          {error && <p className="mb-2 text-xs text-loss">{error}</p>}

          {!user ? (
            <div className="grid gap-2">
              <p className="font-mono text-[10px] uppercase tracking-wider text-faint">NEAR</p>
              <button type="button" onClick={() => (setOpen(false), void signInNear())} className={app ? "flex min-h-11 items-center rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--layer-1)] px-3 py-2 text-left transition-colors hover:border-[var(--line-strong)] hover:bg-[var(--layer-2)]" : "border border-border px-3 py-2 text-left hover:border-border-strong"}>
                <span className="grid">
                  <span>NEAR wallet</span>
                  <span className="text-xs text-muted">HOT, Meteor, NEAR Mobile, Intear, OKX and more</span>
                </span>
              </button>
              {standalone && (
                <p className="text-[11px] leading-relaxed text-faint">
                  In the installed app, HOT and NEAR Mobile work best. Wallets that sign in a browser window (Meteor, Intear, MyNearWallet) may not return to the app.
                </p>
              )}
              <p className="mt-2 font-mono text-[10px] uppercase tracking-wider text-faint">EVM</p>
              {!evmConnectors.length && (
                <p className="text-xs leading-relaxed text-muted">
                  No EVM wallet in this browser. On a phone, open Stonkbag in your wallet app&apos;s browser (MetaMask, Coinbase Wallet, Rabby).
                </p>
              )}
              {evmConnectors.map((c) => (
                <button key={c.uid} type="button" onClick={() => signInEvm(c.id)} className={app ? "flex min-h-11 items-center rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--layer-1)] px-3 text-left transition-colors hover:border-[var(--line-strong)] hover:bg-[var(--layer-2)]" : "border border-border px-3 py-2 text-left hover:border-border-strong"}>
                  {c.name === "Injected" ? "Browser wallet" : c.name}
                </button>
              ))}
              <p className="mt-2 text-[11px] leading-relaxed text-faint">
                Signing in only proves you own the wallet. It can&apos;t move funds. Not available to US persons.
              </p>
            </div>
          ) : (
            <div className="grid gap-2">
              <div className="num break-all text-xs text-muted">{user.address}</div>
              <div className="num text-xs text-faint">
                Basket keys: {user.keyMode ? (user.keyMode === "derived" ? "recoverable from wallet" : "stored in this browser") : "not set up"}
              </div>
              {keysMsg && <div className="num text-xs text-gain">{keysMsg}</div>}
              {keysErr && <div className="text-xs text-loss">{keysErr}</div>}
              {!user.keyMode && (
                <button
                  type="button"
                  className={app ? "flex min-h-11 items-center rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--layer-1)] px-3 text-left transition-colors hover:border-[var(--line-strong)] hover:bg-[var(--layer-2)]" : "border border-border px-3 py-2 text-left hover:border-border-strong"}
                  onClick={async () => {
                    setKeysErr(null);
                    try {
                      const m = await ensureKeys();
                      setKeysMsg(m === "derived" ? "Keys ready. Any device can restore them with one signature." : "Keys ready, stored in this browser.");
                    } catch (e) {
                      setKeysMsg(null);
                      setKeysErr((e as Error).message.split("\n")[0]);
                    }
                  }}
                >
                  Set up basket keys
                </button>
              )}
              <Link href="/portfolio" className={app ? "flex min-h-11 items-center rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--layer-1)] px-3 transition-colors hover:border-[var(--line-strong)] hover:bg-[var(--layer-2)]" : "border border-border px-3 py-2 hover:border-border-strong"}>Portfolio</Link>
              <Link href="/profile" onClick={() => setOpen(false)} className={app ? "flex min-h-11 items-center rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--layer-1)] px-3 transition-colors hover:border-[var(--line-strong)] hover:bg-[var(--layer-2)]" : "border border-border px-3 py-2 hover:border-border-strong"}>
                Profile{user.handle ? <span className="text-muted"> · @{user.handle}</span> : <span className="text-muted"> · set a handle</span>}
              </Link>
              <button type="button" onClick={signOut} className={app ? "flex min-h-11 items-center rounded-[var(--r-sm)] px-3 text-left text-muted transition-colors hover:bg-[var(--layer-2)] hover:text-text" : "border border-border px-3 py-2 text-left text-muted hover:border-border-strong"}>
                Sign out
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
