"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useConnect } from "wagmi";
import { AssetLogo } from "@/components/AssetLogo";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAuth } from "@/lib/client/auth";
import { usePwa } from "@/lib/client/pwa";

const short = (a: string) => (a.length > 18 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);

/** App pages get a solid button; the landing header gets near.com's quiet text button. Same menu either way. */
export function ConnectButton({ variant = "landing" }: { variant?: "landing" | "app" }) {
  const quiet = variant === "landing";
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
  if (loading) return <Skeleton className="h-9 w-[6.5rem] rounded-[10px]" />;

  // The generic "browser wallet" only works where a wallet injected itself (an extension, or a wallet app's browser).
  const hasInjected = typeof window !== "undefined" && "ethereum" in window;
  const evmConnectors = connectors.filter((c, i, all) => all.findIndex((x) => x.name === c.name) === i && (c.id !== "injected" || hasInjected));

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`btn btn-sm ${user ? "btn-secondary num" : quiet ? "btn-ghost text-text" : "btn-primary"}`}
      >
        {user && <span className="live-dot" aria-hidden />}
        {user ? short(user.address) : "Connect"}
      </button>

      {open && (
        <div className="pop absolute right-0 z-50 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--elev)] p-3 text-sm text-text shadow-[var(--shadow-lg)]">
          {busy && <p className="num mb-2 text-xs text-accent-fg">{busy}</p>}
          {error && <p className="mb-2 text-xs text-loss">{error}</p>}

          {!user ? (
            <div className="grid gap-2">
              <p className="px-1 text-[13px] font-medium text-muted">NEAR</p>
              <button type="button" onClick={() => (setOpen(false), void signInNear())} className="flex min-h-12 items-center gap-3 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--elev)] px-3 py-2 text-left transition-[border-color,box-shadow] duration-150 hover:border-[#a1a1a1] hover:shadow-[0_0_0_1px_#a1a1a1]">
                <AssetLogo id="NEAR" size={28} />
                <span className="grid">
                  <span className="font-semibold">NEAR wallet</span>
                  <span className="text-xs text-muted">HOT, Meteor, NEAR Mobile, Intear, OKX and more</span>
                </span>
              </button>
              {standalone && (
                <p className="text-[11px] leading-relaxed text-faint">
                  In the installed app, HOT and NEAR Mobile work best. Wallets that sign in a browser window (Meteor, Intear, MyNearWallet) may not return to the app.
                </p>
              )}
              <p className="mt-2 px-1 text-[13px] font-medium text-muted">EVM</p>
              {!evmConnectors.length && (
                <p className="text-xs leading-relaxed text-muted">
                  No EVM wallet in this browser. On a phone, open nearbags in your wallet app&apos;s browser (MetaMask, Coinbase Wallet, Rabby).
                </p>
              )}
              {evmConnectors.map((c) => (
                <button key={c.uid} type="button" onClick={() => signInEvm(c.id)} className="flex min-h-12 items-center gap-3 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--elev)] px-3 py-2 text-left transition-[border-color,box-shadow] duration-150 hover:border-[#a1a1a1] hover:shadow-[0_0_0_1px_#a1a1a1]">
                  <AssetLogo id="ETH" size={28} />
                  <span className="font-semibold">{c.name === "Injected" ? "Browser wallet" : c.name}</span>
                </button>
              ))}
              <p className="mt-2 text-[11px] leading-relaxed text-faint">
                Signing in only proves you own the wallet. It can&apos;t move funds. Not available to US persons.
              </p>
            </div>
          ) : (
            <div className="grid gap-1">
              <div className="mb-2 rounded-[var(--r-md)] bg-[var(--surface)] p-3">
              <div className="num break-all text-xs text-muted">{user.address}</div>
              <div className="num text-xs text-faint">
                Basket keys: {user.keyMode ? (user.keyMode === "derived" ? "recoverable from wallet" : "stored in this browser") : "not set up"}
              </div>
              {keysMsg && <div className="num text-xs text-gain">{keysMsg}</div>}
              {keysErr && <div className="text-xs text-loss">{keysErr}</div>}
              </div>
              {!user.keyMode && (
                <button
                  type="button"
                  className="flex min-h-11 items-center rounded-[var(--r-md)] px-3 font-medium transition-colors hover:bg-[var(--surface-2)]"
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
              <Link href="/portfolio" className="flex min-h-11 items-center rounded-[var(--r-md)] px-3 font-medium transition-colors hover:bg-[var(--surface-2)]">Portfolio</Link>
              <Link href="/profile" onClick={() => setOpen(false)} className="flex min-h-11 items-center rounded-[var(--r-md)] px-3 font-medium transition-colors hover:bg-[var(--surface-2)]">
                Profile{user.handle ? <span className="ml-1.5 text-muted">· @{user.handle}</span> : <span className="ml-1.5 text-muted">· set a handle</span>}
              </Link>
              <button type="button" onClick={signOut} className="flex min-h-11 items-center rounded-[var(--r-md)] px-3 text-left font-medium text-muted transition-colors hover:bg-[var(--surface-2)] hover:text-text">
                Sign out
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
