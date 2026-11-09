"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useConnect } from "wagmi";
import { useAuth } from "@/lib/client/auth";

const short = (a: string) => (a.length > 18 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);

export function ConnectButton() {
  const { user, loading, busy, error, signInNear, signInEvm, signOut, ensureKeys } = useAuth();
  const { connectors } = useConnect();
  const [open, setOpen] = useState(false);
  const [keysMsg, setKeysMsg] = useState<string | null>(null);
  const [keysErr, setKeysErr] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  if (loading) return <span className="font-mono text-xs text-faint">…</span>;

  const evmConnectors = connectors.filter((c, i, all) => all.findIndex((x) => x.name === c.name) === i);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`font-mono text-xs ${user ? "border border-border px-3 py-1.5 text-text hover:border-border-strong" : "bg-accent px-3 py-1.5 font-semibold text-accent-ink"}`}
      >
        {user ? short(user.address) : "CONNECT"}
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-72 border border-border-strong bg-surface p-3 text-sm shadow-none">
          {busy && <p className="num mb-2 text-xs text-accent">{busy}</p>}
          {error && <p className="mb-2 text-xs text-loss">{error}</p>}

          {!user ? (
            <div className="grid gap-2">
              <p className="font-mono text-[10px] uppercase tracking-wider text-faint">NEAR</p>
              <button type="button" onClick={signInNear} className="border border-border px-3 py-2 text-left hover:border-border-strong">
                NEAR wallet <span className="text-muted">· Meteor, HOT, Intear</span>
              </button>
              <p className="mt-2 font-mono text-[10px] uppercase tracking-wider text-faint">EVM</p>
              {evmConnectors.map((c) => (
                <button key={c.uid} type="button" onClick={() => signInEvm(c.id)} className="border border-border px-3 py-2 text-left hover:border-border-strong">
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
                  className="border border-border px-3 py-2 text-left hover:border-border-strong"
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
              <Link href="/portfolio" className="border border-border px-3 py-2 hover:border-border-strong">Portfolio</Link>
              <Link href="/profile" onClick={() => setOpen(false)} className="border border-border px-3 py-2 hover:border-border-strong">
                Profile{user.handle ? <span className="text-muted"> · @{user.handle}</span> : <span className="text-muted"> · set a handle</span>}
              </Link>
              <button type="button" onClick={signOut} className="border border-border px-3 py-2 text-left text-muted hover:border-border-strong">
                Sign out
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
