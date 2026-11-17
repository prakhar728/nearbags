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
  trading: Trading;
}

interface Trading {
  enabled: boolean;
  dailyUsd: number;
  anyBag: boolean;
  basketIds: number[];
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
  const [tradingFor, setTradingFor] = useState<number | null>(null);

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

  // Access dropdown: "Manage bags only" turns trading off at once (limits are kept for next time); "Manage bags and
  // trade" opens the limits to save. Asked for in the round 1 test: a "Trading" button read like a status.
  const setAccess = async (k: Key, access: string) => {
    if (access === "trade") return setTradingFor(k.id);
    setTradingFor(null);
    if (!k.trading.enabled) return;
    setErr(null);
    const r = await fetch(`/api/agent-keys/${k.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trading: { ...k.trading, enabled: false } }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) setErr(j.error ?? "Couldn't save.");
    void load();
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
          . A new bag still goes live only after you buy it yourself. Buying and selling is off unless you turn it on for a key: then it trades with its own wallet, inside your
          limits, and sale money comes to your wallet. It can never withdraw.
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
                {k.trading.enabled && ` · up to $${k.trading.dailyUsd} a day, ${k.trading.anyBag ? "any live bag" : `${k.trading.basketIds.length} bag${k.trading.basketIds.length === 1 ? "" : "s"}`}`}
              </div>
              {tradingFor === k.id && (
                <TradingForm
                  k={k}
                  onSaved={() => {
                    setTradingFor(null);
                    void load();
                  }}
                  onCancel={() => setTradingFor(null)}
                />
              )}
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
              <div className="flex items-center gap-2">
                <label className="sr-only" htmlFor={`access-${k.id}`}>
                  What {k.name} can do
                </label>
                <select
                  id={`access-${k.id}`}
                  className="input py-1.5 text-sm"
                  value={tradingFor === k.id || k.trading.enabled ? "trade" : "manage"}
                  onChange={(e) => void setAccess(k, e.target.value)}
                >
                  <option value="manage">Manage bags only</option>
                  <option value="trade">Manage bags and trade</option>
                </select>
                {k.trading.enabled && tradingFor !== k.id && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setTradingFor(k.id)}>
                    Limits
                  </button>
                )}
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirming(k.id)}>
                  Revoke
                </button>
              </div>
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

/** Turn trading on or off for one key: a daily buy limit and which bags it may trade. */
function TradingForm({ k, onSaved, onCancel }: { k: Key; onSaved: () => void; onCancel: () => void }) {
  const [t, setT] = useState<Trading>({ ...k.trading, enabled: true });
  const [bags, setBags] = useState<{ id: number; slug: string; name: string }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/baskets")
      .then((r) => r.json())
      .then((j) => live && setBags(j.baskets ?? []))
      .catch(() => live && setBags([]));
    return () => {
      live = false;
    };
  }, []);

  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/agent-keys/${k.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trading: t }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? "Couldn't save.");
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 space-y-3 rounded-[var(--r-sm)] border border-[var(--line)] p-3">
      <p className="text-sm text-muted">It buys and sells bags with its own wallet. Sale money comes to your wallet. It can never withdraw.</p>
      {t.enabled && (
        <>
          <label className="field">
            <span className="label">Most it can buy in 24 hours (USD, up to 1,000)</span>
            <input
              className="input num w-32"
              inputMode="numeric"
              value={String(t.dailyUsd)}
              onChange={(e) => setT({ ...t, dailyUsd: Number(e.target.value.replace(/[^0-9]/g, "")) || 0 })}
            />
          </label>
          <label className="flex cursor-pointer items-center gap-3 text-sm">
            <input type="checkbox" className="check" checked={t.anyBag} onChange={(e) => setT({ ...t, anyBag: e.target.checked })} />
            Any live bag
          </label>
          {!t.anyBag && (
            <div className="max-h-48 space-y-1.5 overflow-y-auto">
              {bags === null && <p className="text-xs text-muted">Loading bags…</p>}
              {bags?.map((b) => (
                <label key={b.id} className="flex cursor-pointer items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    className="check"
                    checked={t.basketIds.includes(b.id)}
                    onChange={(e) => setT({ ...t, basketIds: e.target.checked ? [...t.basketIds, b.id] : t.basketIds.filter((x) => x !== b.id) })}
                  />
                  {b.name}
                </label>
              ))}
            </div>
          )}
        </>
      )}
      {err && <p className="text-xs text-loss">{err}</p>}
      <div className="flex gap-2">
        <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={save}>
          {busy ? "Saving…" : "Save"}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
