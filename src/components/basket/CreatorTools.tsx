"use client";
// Creator-only controls on the basket page: publish hint while pending, edit text, close to new buyers.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LIMITS } from "@/lib/basket-text";
import { useAuth } from "@/lib/client/auth";

export interface CreatorToolsBasket {
  slug: string;
  creatorId: number;
  status: "draft" | "pending" | "live" | "closed" | "hidden";
  minBuyUsd: number;
  tagline: string;
  thesis: string;
  risks: string;
  exitSignal: string | null;
  deepDive: string | null;
  assets: { assetId: string; why: string }[];
}

async function send(url: string, method: string, body?: unknown) {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.errors?.join(" ") ?? j.error ?? `Request failed (${r.status})`);
  return j;
}

export function CreatorTools({ basket: b }: { basket: CreatorToolsBasket }) {
  const { user } = useAuth();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [closing, setClosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!user || user.id !== b.creatorId) return null;

  const close = async () => {
    setBusy(true);
    setErr(null);
    try {
      await send(`/api/baskets/${b.slug}/close`, "POST");
      setClosing(false);
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card card-ticks card-pad space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="label flex items-center gap-2"><span className="inline-block h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />Your basket</div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setEditing(!editing)} className="btn btn-secondary btn-sm">
            {editing ? "Cancel edit" : "Edit text"}
          </button>
          {(b.status === "live" || b.status === "pending") &&
            (closing ? (
              <>
                <button type="button" disabled={busy} onClick={close} className="btn btn-danger btn-sm">
                  {busy ? "Closing…" : "Yes, close it"}
                </button>
                <button type="button" onClick={() => setClosing(false)} className="btn btn-ghost btn-sm">
                  Keep open
                </button>
              </>
            ) : (
              <button type="button" onClick={() => setClosing(true)} className="btn btn-ghost btn-sm">
                Close to new buyers
              </button>
            ))}
        </div>
      </div>
      {b.status === "pending" && (
        <p className="text-sm">
          Publish by buying at least <span className="num text-accent">${b.minBuyUsd}</span> of your basket. It goes live once that buy completes.
        </p>
      )}
      {closing && <p className="callout callout-warn text-xs">Closing stops new buys for good. Holders can still sell and withdraw. You can&apos;t reopen it.</p>}
      {err && <p className="callout callout-warn text-xs text-loss">{err}</p>}
      {editing && (
        <EditForm
          b={b}
          onDone={() => {
            setEditing(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function EditForm({ b, onDone }: { b: CreatorToolsBasket; onDone: () => void }) {
  const [f, setF] = useState({ tagline: b.tagline, thesis: b.thesis, risks: b.risks, exitSignal: b.exitSignal ?? "", deepDive: b.deepDive ?? "" });
  const [why, setWhy] = useState<Record<string, string>>(Object.fromEntries(b.assets.map((a) => [a.assetId, a.why])));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setErr(null);
    setSaved(null);
    try {
      const r = await send(`/api/baskets/${b.slug}`, "PATCH", { ...f, why });
      if (!r.changed.length) setSaved("Nothing changed.");
      else onDone();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 border-t border-[var(--line)] pt-5">
      <p className="text-xs text-muted">Every change is logged with a timestamp and shown publicly. Name, assets, weights and fee can&apos;t change.</p>
      <Field label="Tagline" max={LIMITS.tagline} value={f.tagline} onChange={(v) => setF({ ...f, tagline: v })} />
      <Field label="Thesis" max={LIMITS.thesis} rows={6} value={f.thesis} onChange={(v) => setF({ ...f, thesis: v })} />
      {b.assets.map((a) => (
        <Field key={a.assetId} label={`Why ${a.assetId}`} max={LIMITS.why} value={why[a.assetId]} onChange={(v) => setWhy({ ...why, [a.assetId]: v })} />
      ))}
      <Field label="Risks" max={LIMITS.risks} rows={3} value={f.risks} onChange={(v) => setF({ ...f, risks: v })} />
      <Field label="Exit signal (optional)" max={LIMITS.exitSignal} rows={2} value={f.exitSignal} onChange={(v) => setF({ ...f, exitSignal: v })} />
      <Field label="Deep dive (optional, Markdown, links only)" max={LIMITS.deepDive} rows={8} value={f.deepDive} onChange={(v) => setF({ ...f, deepDive: v })} />
      {err && <p className="callout callout-warn text-xs text-loss">{err}</p>}
      {saved && <p className="text-xs text-muted">{saved}</p>}
      <button type="button" disabled={busy} onClick={save} className="btn btn-primary">
        {busy ? "Saving…" : "Save changes"}
      </button>
    </div>
  );
}

export function Field({
  label,
  value,
  onChange,
  max,
  rows,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  max: number;
  rows?: number;
  placeholder?: string;
}) {
  const over = value.length > max;
  const cls = `input ${over ? "!border-loss" : ""}`;
  return (
    <label className="block">
      <span className="flex items-baseline justify-between gap-3">
        <span className="label">{label}</span>
        <span className={`num text-[10px] ${over ? "text-loss" : "text-faint"}`}>
          {value.length}/{max.toLocaleString("en-US")}
        </span>
      </span>
      {rows ? (
        <textarea rows={rows} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={`${cls} mt-2 resize-y`} />
      ) : (
        <input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={`${cls} mt-2`} />
      )}
    </label>
  );
}
