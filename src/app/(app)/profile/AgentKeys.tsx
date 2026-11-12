"use client";
// Agent keys: let an AI agent manage your baskets through the nearbags MCP server. The key is shown once.
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ago } from "@/lib/format";
import { useAuth } from "@/lib/client/auth";

interface Key {
  id: number;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
}

const MCP_URL = "https://nearbags.com/api/mcp";

export function AgentKeys() {
  const { user } = useAuth();
  const [keys, setKeys] = useState<Key[] | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [fresh, setFresh] = useState<{ key: string; name: string } | null>(null);
  const [confirming, setConfirming] = useState<number | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/agent-keys", { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (r.ok) setKeys(j.keys);
    else setErr(j.error ?? "Couldn't load your keys.");
  }, []);

  useEffect(() => {
    if (!user) return;
    let live = true;
    fetch("/api/agent-keys", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => live && setKeys(j.keys ?? []))
      .catch(() => live && setErr("Couldn't load your keys."));
    return () => {
      live = false;
    };
  }, [user]);

  if (!user) return null;

  const create = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/agent-keys", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? "Couldn't make a key.");
      setFresh({ key: j.key, name: j.name });
      setName("");
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: number) => {
    setErr(null);
    const r = await fetch(`/api/agent-keys/${id}`, { method: "DELETE" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) setErr(j.error ?? "Couldn't revoke it.");
    setConfirming(null);
    await load();
  };

  const copy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied(null), 1500);
    } catch {}
  };

  const command = fresh ? `claude mcp add --transport http nearbags ${MCP_URL} --header "Authorization: Bearer ${fresh.key}"` : "";

  return (
    <section className="max-w-xl space-y-4">
      <div className="space-y-1.5">
        <h2 className="text-[15px] font-semibold tracking-tight">Agent keys</h2>
        <p className="text-sm leading-relaxed text-muted">
          Give an AI agent a key and it can create, edit and close your bags and run your agent bags, through the{" "}
          <Link href="/docs/agents" className="underline underline-offset-2 hover:text-text">
            nearbags MCP server
          </Link>
          . It can&apos;t buy, sell or move money, and a new bag still goes live only after you buy it yourself.
        </p>
      </div>

      {fresh && (
        <div className="card space-y-3 border-[var(--accent-line)] p-5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-medium">Key for {fresh.name}</span>
            <span className="text-xs text-loss">Shown once. Copy it now.</span>
          </div>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-[var(--r-sm)] bg-[var(--surface-2)] px-3 py-2 font-mono text-[13px]">{fresh.key}</code>
            <button type="button" className="btn btn-secondary btn-sm shrink-0" onClick={() => copy("key", fresh.key)}>
              {copied === "key" ? "Copied" : "Copy"}
            </button>
          </div>
          <div className="space-y-1.5">
            <span className="text-xs text-muted">Claude Code</span>
            <div className="flex items-start gap-2">
              <code className="min-w-0 flex-1 break-all rounded-[var(--r-sm)] bg-[var(--surface-2)] px-3 py-2 font-mono text-[12px] leading-relaxed">{command}</code>
              <button type="button" className="btn btn-secondary btn-sm shrink-0" onClick={() => copy("cmd", command)}>
                {copied === "cmd" ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFresh(null)}>
            Done, I saved it
          </button>
        </div>
      )}

      <div className="card divide-y divide-[var(--line)] overflow-hidden">
        {keys === null && <p className="p-5 text-sm text-muted">Loading…</p>}
        {keys?.length === 0 && <p className="p-5 text-sm text-muted">No keys yet.</p>}
        {keys?.map((k) => (
          <div key={k.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
            <div className="min-w-0">
              <div className="text-sm font-medium">{k.name}</div>
              <div className="text-xs text-faint">
                <span className="font-mono">{k.prefix}…</span> · made {ago(k.createdAt)} · {k.lastUsedAt ? `used ${ago(k.lastUsedAt)}` : "never used"}
              </div>
            </div>
            {confirming === k.id ? (
              <div className="flex items-center gap-2">
                <button type="button" className="btn btn-danger btn-sm" onClick={() => revoke(k.id)}>
                  Revoke for good
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirming(null)}>
                  Keep
                </button>
              </div>
            ) : (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirming(k.id)}>
                Revoke
              </button>
            )}
          </div>
        ))}
        <form
          className="flex flex-wrap items-center gap-2 bg-[var(--surface)] px-5 py-3.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) create();
          }}
        >
          <input className="input min-w-0 flex-1" placeholder="Name it, e.g. Claude on my laptop" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
          <button type="submit" className="btn btn-primary btn-sm" disabled={busy || !name.trim()}>
            {busy ? "Making…" : "New key"}
          </button>
        </form>
      </div>
      {err && <p className="text-xs text-loss">{err}</p>}
    </section>
  );
}
