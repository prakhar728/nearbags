"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Loading, Skeleton } from "@/components/ui/Skeleton";
import { useAuth } from "@/lib/client/auth";

interface AdminData {
  settings: { buysPaused: boolean; delisted: string[] };
  baskets: { id: number; slug: string; name: string; status: string; isHouse: boolean; hiddenReason: string | null }[];
  audit: { id: number; actor: string; action: string; target: string | null; createdAt: string }[];
  assets: { id: string; name: string; kind: string }[];
  platformFeeBps: number;
  platformFeeAccount: string | null;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, { ...init, headers: { "Content-Type": "application/json" }, cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? `Request failed (${r.status})`);
  return j as T;
}

export function AdminView() {
  const { user, loading } = useAuth();
  const qc = useQueryClient();
  const [err, setErr] = useState<string | null>(null);
  const q = useQuery({ queryKey: ["admin"], enabled: Boolean(user?.isAdmin), queryFn: () => api<AdminData>("/api/admin") });

  if (loading) return <AdminSkeleton />;
  if (!user?.isAdmin) return <p className="text-sm text-muted">Admins only. Sign in with an admin wallet.</p>;
  if (q.error) return <p className="text-sm text-loss">{(q.error as Error).message}</p>;
  if (!q.data) return <AdminSkeleton />;
  const d = q.data;

  const act = async (body: object) => {
    setErr(null);
    try {
      await api("/api/admin", { method: "POST", body: JSON.stringify(body) });
      await qc.invalidateQueries({ queryKey: ["admin"] });
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  return (
    <div className="grid gap-8">
      {err && <p className="text-xs text-loss">{err}</p>}

      <section className="grid gap-3">
        <h2 className="font-mono text-[11px] uppercase tracking-wider text-faint">Switches</h2>
        <div className="flex flex-wrap items-center gap-4 border border-border p-4">
          <span className="text-sm">Buying is {d.settings.buysPaused ? <b className="text-loss">paused</b> : <b className="text-gain">on</b>}. Selling always works.</span>
          <button type="button" onClick={() => act({ action: "pause_buys", paused: !d.settings.buysPaused })} className="border border-border-strong px-3 py-1.5 font-mono text-xs hover:border-text">
            {d.settings.buysPaused ? "RESUME BUYS" : "PAUSE ALL BUYS"}
          </button>
          <span className="num text-xs text-muted">
            Platform fee {(d.platformFeeBps / 100).toFixed(2)}% → {d.platformFeeAccount ?? "no fee account set (fee off)"}
          </span>
        </div>
      </section>

      <section className="grid gap-3">
        <h2 className="font-mono text-[11px] uppercase tracking-wider text-faint">Assets</h2>
        <div className="flex flex-wrap gap-2">
          {d.assets.map((a) => {
            const off = d.settings.delisted.includes(a.id);
            return (
              <button key={a.id} type="button" title={off ? "Delisted: click to relist" : "Click to delist"} onClick={() => act({ action: "delist", assetId: a.id, delisted: !off })} className={`num border px-2 py-1 text-xs ${off ? "border-loss text-loss line-through" : "border-border text-muted hover:border-border-strong"}`}>
                {a.id}
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-faint">Delisted assets can&apos;t be bought. Holders can still sell and withdraw.</p>
      </section>

      <section className="grid gap-3">
        <h2 className="font-mono text-[11px] uppercase tracking-wider text-faint">Baskets</h2>
        <div className="divide-y divide-border border border-border">
          {d.baskets.map((b) => (
            <div key={b.id} className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
              <span>
                {b.name} <span className="num text-xs text-faint">/{b.slug} · {b.status}{b.isHouse ? " · house" : ""}</span>
              </span>
              <button
                type="button"
                onClick={() => act({ action: "hide_basket", basketId: b.id, hidden: b.status !== "hidden", reason: b.status !== "hidden" ? "Hidden by admin" : undefined })}
                className="border border-border px-2 py-1 font-mono text-xs hover:border-border-strong"
              >
                {b.status === "hidden" ? "UNHIDE" : "HIDE"}
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-3">
        <h2 className="font-mono text-[11px] uppercase tracking-wider text-faint">Audit log</h2>
        <div className="num divide-y divide-border border border-border text-xs">
          {d.audit.length === 0 && <p className="p-3 text-muted">Nothing yet.</p>}
          {d.audit.map((a) => (
            <div key={a.id} className="grid grid-cols-[150px_1fr] gap-3 p-2.5">
              <span className="text-faint">{new Date(a.createdAt).toLocaleString()}</span>
              <span>
                {a.actor} · {a.action} {a.target ? `· ${a.target}` : ""}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function AdminSkeleton() {
  return (
    <Loading label="Loading admin" className="grid gap-8">
      <section className="grid gap-3">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-[62px] w-full" />
      </section>
      <section className="grid gap-3">
        <Skeleton className="h-3 w-16" />
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 14 }, (_, i) => (
            <Skeleton key={i} className="h-[26px] w-12" />
          ))}
        </div>
      </section>
      <section className="grid gap-3">
        <Skeleton className="h-3 w-20" />
        <div className="divide-y divide-border border border-border">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="flex items-center justify-between gap-3 p-3">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-6 w-20" />
            </div>
          ))}
        </div>
      </section>
    </Loading>
  );
}
