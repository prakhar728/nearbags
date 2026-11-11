"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Loading, Skeleton } from "@/components/ui/Skeleton";
import { useAuth } from "@/lib/client/auth";
import { StatsView } from "./StatsView";

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
  const [tab, setTab] = useState<"stats" | "controls">("stats");

  if (loading) return <AdminSkeleton />;
  if (!user?.isAdmin) return <p className="callout">Admins only. Sign in with an admin wallet.</p>;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-8">
      <div className="seg self-start justify-self-start" role="tablist" aria-label="Admin sections">
        {(
          [
            ["stats", "Stats"],
            ["controls", "Controls"],
          ] as const
        ).map(([k, label]) => (
          <button key={k} type="button" role="tab" className="seg-item" aria-selected={tab === k} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>
      {tab === "stats" ? <StatsView /> : <Controls />}
    </div>
  );
}

function Controls() {
  const qc = useQueryClient();
  const [err, setErr] = useState<string | null>(null);
  const q = useQuery({ queryKey: ["admin"], queryFn: () => api<AdminData>("/api/admin") });

  if (q.error) return <p className="callout callout-warn text-loss">{(q.error as Error).message}</p>;
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
    <div className="grid grid-cols-[minmax(0,1fr)] gap-8">
      {err && <p className="callout callout-warn text-xs text-loss">{err}</p>}

      <section className="grid grid-cols-[minmax(0,1fr)] gap-3">
        <h2 className="label">Switches</h2>
        <div className="card flex flex-wrap items-center gap-4 p-5">
          <span className="text-sm">Buying is {d.settings.buysPaused ? <b className="text-loss">paused</b> : <b className="text-gain">on</b>}. Selling always works.</span>
          <button type="button" onClick={() => act({ action: "pause_buys", paused: !d.settings.buysPaused })} className="btn btn-secondary btn-sm">
            {d.settings.buysPaused ? "Resume buys" : "Pause all buys"}
          </button>
          <span className="num text-xs text-muted">
            Platform fee {(d.platformFeeBps / 100).toFixed(2)}% → {d.platformFeeAccount ?? "no fee account set (fee off)"}
          </span>
        </div>
      </section>

      <section className="grid grid-cols-[minmax(0,1fr)] gap-3">
        <h2 className="label">Assets</h2>
        <div className="flex flex-wrap gap-2">
          {d.assets.map((a) => {
            const off = d.settings.delisted.includes(a.id);
            return (
              <button key={a.id} type="button" title={off ? "Delisted: click to relist" : "Click to delist"} onClick={() => act({ action: "delist", assetId: a.id, delisted: !off })} className={`chip ${off ? "!border-loss/50 !bg-[var(--loss-soft)] !text-loss line-through" : ""}`}>
                {a.id}
              </button>
            );
          })}
        </div>
        <p className="fine">Delisted assets can&apos;t be bought. Holders can still sell and withdraw.</p>
      </section>

      <section className="grid grid-cols-[minmax(0,1fr)] gap-3">
        <h2 className="label">Baskets</h2>
        <div className="card divide-y divide-[var(--line)] overflow-hidden">
          {d.baskets.map((b) => (
            <div key={b.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 text-sm transition-colors hover:bg-[var(--layer-1)]">
              <span>
                {b.name} <span className="num text-xs text-faint">/{b.slug} · {b.status}{b.isHouse ? " · house" : ""}</span>
              </span>
              <button
                type="button"
                onClick={() => act({ action: "hide_basket", basketId: b.id, hidden: b.status !== "hidden", reason: b.status !== "hidden" ? "Hidden by admin" : undefined })}
                className="btn btn-secondary btn-sm"
              >
                {b.status === "hidden" ? "Unhide" : "Hide"}
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-[minmax(0,1fr)] gap-3">
        <h2 className="label">Audit log</h2>
        <div className="card num divide-y divide-[var(--line)] overflow-hidden text-xs">
          {d.audit.length === 0 && <p className="p-5 text-muted">Nothing yet.</p>}
          {d.audit.map((a) => (
            <div key={a.id} className="grid grid-cols-[150px_1fr] gap-3 px-5 py-3">
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
    <Loading label="Loading admin" className="grid grid-cols-[minmax(0,1fr)] gap-8">
      <section className="grid grid-cols-[minmax(0,1fr)] gap-3">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-[78px] w-full rounded-[var(--r-lg)]" />
      </section>
      <section className="grid grid-cols-[minmax(0,1fr)] gap-3">
        <Skeleton className="h-3 w-16" />
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 14 }, (_, i) => (
            <Skeleton key={i} className="h-[30px] w-14 rounded-full" />
          ))}
        </div>
      </section>
      <section className="grid grid-cols-[minmax(0,1fr)] gap-3">
        <Skeleton className="h-3 w-20" />
        <div className="card divide-y divide-[var(--line)] overflow-hidden">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="flex items-center justify-between gap-3 px-5 py-3.5">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-[34px] w-20 rounded-full" />
            </div>
          ))}
        </div>
      </section>
    </Loading>
  );
}
