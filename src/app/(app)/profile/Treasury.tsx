"use client";
// Treasury: make one of your own bags public, with every fee in and every purchase shown, and route your creator fees
// into it. Spending it works like any bag you hold: only your wallet (and the agent, if you let it) can move it.
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/client/auth";

interface Settings {
  treasury: { positionId: number; routeFees: boolean } | null;
  options: { positionId: number; basket: string; slug: string; recoveryKeyAdded: boolean }[];
}

export function Treasury() {
  const { user } = useAuth();
  const [s, setS] = useState<Settings | null>(null);
  const [pick, setPick] = useState<number | "">("");
  const [route, setRoute] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let live = true;
    fetch("/api/treasury", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: Settings) => {
        if (!live || !j.options) return;
        setS(j);
        setPick(j.treasury?.positionId ?? "");
        setRoute(j.treasury?.routeFees ?? true);
      })
      .catch(() => live && setErr("Couldn't load your treasury."));
    return () => {
      live = false;
    };
  }, [user]);

  if (!user || !s) return null;

  const save = async (positionId: number | null, routeFees: boolean) => {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/treasury", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ positionId, routeFees }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? "Couldn't save.");
      setS(j);
      setPick(j.treasury?.positionId ?? "");
      setRoute(j.treasury?.routeFees ?? true);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const publicUrl = `/t/${encodeURIComponent(user.handle ?? user.address)}`;
  const changed = s.treasury ? pick !== s.treasury.positionId || route !== s.treasury.routeFees : pick !== "";

  return (
    <section className="max-w-xl space-y-4">
      <div className="space-y-1.5">
        <h2 className="text-[15px] font-semibold tracking-tight">Treasury</h2>
        <p className="text-sm leading-relaxed text-muted">
          Make one of your bags a public treasury. Anyone can see what it holds, every fee that came in and everything it bought. Your creator fees can go into it instead of your
          wallet. Only you can spend it.
        </p>
      </div>

      <div className="card space-y-4 p-5">
        {s.options.length === 0 ? (
          <p className="text-sm text-muted">Buy a bag first. Your treasury is one of the bags you hold.</p>
        ) : (
          <>
            <label className="block space-y-1.5">
              <span className="label">Bag</span>
              <select className="input w-full" value={pick} onChange={(e) => setPick(e.target.value ? Number(e.target.value) : "")}>
                <option value="">No treasury</option>
                {s.options.map((o) => (
                  <option key={o.positionId} value={o.positionId} disabled={!o.recoveryKeyAdded}>
                    {o.basket}
                    {o.recoveryKeyAdded ? "" : " (add your recovery key first)"}
                  </option>
                ))}
              </select>
            </label>
            {pick !== "" && (
              <label className="flex cursor-pointer items-start gap-3 text-sm">
                <input type="checkbox" className="check mt-0.5" checked={route} onChange={(e) => setRoute(e.target.checked)} />
                <span className="text-muted">Send the fees my bags earn into this treasury instead of my wallet.</span>
              </label>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" className="btn btn-primary btn-sm" disabled={busy || !changed} onClick={() => save(pick === "" ? null : pick, route)}>
                {busy ? "Saving…" : "Save"}
              </button>
              {s.treasury && (
                <Link href={publicUrl} className="text-sm underline underline-offset-2 hover:text-text">
                  View the public page
                </Link>
              )}
            </div>
          </>
        )}
      </div>
      {err && <p className="text-xs text-loss">{err}</p>}
    </section>
  );
}
