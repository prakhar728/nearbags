"use client";
// Minimal profile editor: handle, bio, X link.
import Link from "next/link";
import { useEffect, useState } from "react";
import { Field } from "@/components/basket/CreatorTools";
import { useAuth } from "@/lib/client/auth";
import { BIO_MAX, HANDLE_RE } from "@/lib/profile-rules";

interface Profile {
  handle: string | null;
  bio: string | null;
  xUrl: string | null;
}

export function ProfileForm() {
  const { user, loading, refresh } = useAuth();
  const [form, setForm] = useState<{ handle: string; bio: string; xUrl: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let live = true;
    fetch("/api/profile")
      .then((r) => r.json())
      .then((j: { profile?: Profile }) => {
        if (live && j.profile) setForm({ handle: j.profile.handle ?? "", bio: j.profile.bio ?? "", xUrl: j.profile.xUrl ?? "" });
      })
      .catch(() => live && setErr("Couldn't load your profile."));
    return () => {
      live = false;
    };
  }, [user]);

  if (loading) return <p className="font-mono text-xs text-faint">…</p>;
  if (!user) return <p className="text-sm text-muted">Connect a wallet (top right) to edit your profile.</p>;
  if (!form) return <p className="font-mono text-xs text-faint">Loading…</p>;

  const handleOk = !form.handle || HANDLE_RE.test(form.handle);
  const save = async () => {
    setBusy(true);
    setErr(null);
    setSaved(null);
    try {
      const body: Record<string, string> = { bio: form.bio, xUrl: form.xUrl };
      if (form.handle) body.handle = form.handle;
      const r = await fetch("/api/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.errors?.join(" ") ?? j.error ?? "Couldn't save.");
      setForm({ handle: j.profile.handle ?? "", bio: j.profile.bio ?? "", xUrl: j.profile.xUrl ?? "" });
      setSaved("Saved.");
      await refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-lg space-y-5">
      <div>
        <Field label="Handle" max={20} value={form.handle} placeholder="3–20 chars: a–z 0–9 _" onChange={(v) => setForm({ ...form, handle: v.toLowerCase() })} />
        {!handleOk && <p className="mt-1 text-xs text-loss">3–20 characters, a–z, 0–9 and _ only.</p>}
      </div>
      <Field label="Bio" max={BIO_MAX} rows={3} value={form.bio} onChange={(v) => setForm({ ...form, bio: v })} />
      <Field label="X link (optional, not verified)" max={200} value={form.xUrl} placeholder="https://x.com/you" onChange={(v) => setForm({ ...form, xUrl: v })} />
      {err && <p className="text-xs text-loss">{err}</p>}
      <div className="flex items-center gap-4">
        <button
          type="button"
          disabled={busy || !handleOk || form.bio.length > BIO_MAX}
          onClick={save}
          className="bg-accent px-4 py-2 font-mono text-xs font-semibold text-accent-ink disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save"}
        </button>
        {saved && <span className="font-mono text-xs text-muted">{saved}</span>}
        {form.handle && HANDLE_RE.test(form.handle) && (
          <Link href={`/c/${form.handle}`} className="font-mono text-xs text-muted hover:text-text">
            View profile
          </Link>
        )}
      </div>
    </div>
  );
}
