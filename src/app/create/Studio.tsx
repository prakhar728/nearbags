"use client";
// Creator studio (spec §5.3): 1 assets & weights with live analytics, 2 thesis, 3 fee, 4 review + publish.
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { BacktestView } from "@/components/basket/BacktestView";
import { Field } from "@/components/basket/CreatorTools";
import { Label, Pairs } from "@/components/basket/Pairs";
import type { AnalyticsView } from "@/lib/analytics/view";
import { ASSETS, getAsset, type AssetKind } from "@/lib/assets";
import { minBuyUsd, RULES, validateWeights } from "@/lib/basket-rules";
import { HORIZON_LABEL, HORIZONS, LIMITS, markdownProblems, type Horizon } from "@/lib/basket-text";
import { useAuth } from "@/lib/client/auth";
import { feePct } from "@/lib/format";

interface Choice {
  assetId: string;
  pct: number;
}

const STEPS = ["Assets", "Thesis", "Fee", "Publish"] as const;
const GROUPS: { kind: AssetKind; label: string }[] = [
  { kind: "stock", label: "Stocks" },
  { kind: "etf", label: "ETFs" },
  { kind: "crypto", label: "Crypto" },
  { kind: "stable", label: "Cash" },
];

function evenSplit(ids: string[]): Choice[] {
  const n = ids.length;
  if (!n) return [];
  const base = Math.floor(100 / n);
  let rest = 100 - base * n;
  return ids.map((assetId) => ({ assetId, pct: base + (rest-- > 0 ? 1 : 0) }));
}

export function Studio({ platformFeeBps }: { platformFeeBps: number }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [picks, setPicks] = useState<Choice[]>([]);
  const [manual, setManual] = useState(false);
  const [t, setT] = useState({ name: "", tagline: "", thesis: "", risks: "", exitSignal: "", deepDive: "" });
  const [horizon, setHorizon] = useState<Horizon | null>(null);
  const [why, setWhy] = useState<Record<string, string>>({});
  const [feeBps, setFeeBps] = useState(50);
  const [house, setHouse] = useState(false);
  const [accept, setAccept] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishErr, setPublishErr] = useState<string[] | null>(null);

  const weights = useMemo(() => picks.map((p) => ({ assetId: p.assetId, weightBps: Math.round(p.pct * 100) })), [picks]);
  const weightErrors = useMemo(() => validateWeights(weights), [weights]);
  const sum = picks.reduce((s, p) => s + (Number.isFinite(p.pct) ? p.pct : 0), 0);
  const minBuy = weightErrors.length ? null : minBuyUsd(weights, feeBps + platformFeeBps);
  const hint = useMemo(() => (weightErrors.length ? null : minBuyHint(weights, feeBps + platformFeeBps)), [weights, weightErrors, feeBps, platformFeeBps]);
  const preview = usePreview(weightErrors.length ? null : weights);

  const toggle = (id: string) => {
    const has = picks.some((p) => p.assetId === id);
    if (!has && picks.length >= RULES.maxAssets) return;
    const ids = has ? picks.filter((p) => p.assetId !== id).map((p) => p.assetId) : [...picks.map((p) => p.assetId), id];
    if (!manual) setPicks(evenSplit(ids));
    else setPicks(has ? picks.filter((p) => p.assetId !== id) : [...picks, { assetId: id, pct: Math.max(5, Math.min(50, 100 - sum)) }]);
  };
  const setPct = (id: string, pct: number) => {
    setManual(true);
    setPicks(picks.map((p) => (p.assetId === id ? { ...p, pct } : p)));
  };

  const textErrors = useMemo(() => {
    const e: string[] = [];
    const req = (k: keyof typeof t, label: string, max: number) => {
      if (!t[k].trim()) e.push(`${label} is required.`);
      else if (t[k].trim().length > max) e.push(`${label}: ${max} characters max.`);
    };
    req("name", "Name", LIMITS.name);
    req("tagline", "Tagline", LIMITS.tagline);
    req("thesis", "Thesis", LIMITS.thesis);
    req("risks", "Risks", LIMITS.risks);
    if (t.exitSignal.trim().length > LIMITS.exitSignal) e.push(`Exit signal: ${LIMITS.exitSignal} characters max.`);
    if (t.deepDive.trim().length > LIMITS.deepDive) e.push(`Deep dive: ${LIMITS.deepDive} characters max.`);
    if (!horizon) e.push("Pick a time horizon.");
    for (const p of picks) {
      const w = (why[p.assetId] ?? "").trim();
      if (!w) e.push(`Say why ${p.assetId} is in.`);
      else if (w.length > LIMITS.why) e.push(`Why ${p.assetId}: ${LIMITS.why} characters max.`);
    }
    e.push(...markdownProblems("Thesis", t.thesis), ...markdownProblems("Deep dive", t.deepDive));
    return e;
  }, [t, horizon, picks, why]);

  const canGo = [weightErrors.length === 0, textErrors.length === 0, true, true];
  const reachable = (i: number) => canGo.slice(0, i).every(Boolean);

  const publish = async () => {
    setPublishing(true);
    setPublishErr(null);
    try {
      const r = await fetch("/api/baskets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...t,
          horizon,
          feeBps,
          assets: picks.map((p) => ({ assetId: p.assetId, weightBps: Math.round(p.pct * 100), why: why[p.assetId] ?? "" })),
          house: user?.isAdmin ? house : undefined,
          acceptRisk: accept,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((j.errors ?? [j.error ?? `Publish failed (${r.status})`]).join("\n"));
      router.push(`/b/${j.slug}`);
    } catch (e) {
      setPublishErr((e as Error).message.split("\n"));
      setPublishing(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="font-mono text-2xl font-semibold">Make a basket</h1>
        <p className="max-w-xl text-sm text-muted">Pick the assets, say why, set your fee. After publish the assets, weights, fee and name are frozen. Text stays editable, with every edit shown.</p>
      </div>

      {!loading && !user && (
        <p className="border-l-2 border-accent pl-3 text-sm">Connect a wallet (top right) to publish. You can build and preview without one.</p>
      )}

      <ol className="flex flex-wrap gap-1">
        {STEPS.map((s, i) => (
          <li key={s}>
            <button
              type="button"
              disabled={!reachable(i)}
              onClick={() => setStep(i)}
              className={`num border px-3 py-1.5 text-[11px] uppercase tracking-wider disabled:opacity-40 ${i === step ? "border-accent text-accent" : "border-border text-muted hover:text-text"}`}
            >
              {i + 1} {s}
            </button>
          </li>
        ))}
      </ol>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          {step === 0 && (
            <>
              <div className="space-y-4">
                {GROUPS.map((g) => (
                  <div key={g.kind}>
                    <Label>{g.label}</Label>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {ASSETS.filter((a) => a.kind === g.kind).map((a) => {
                        const on = picks.some((p) => p.assetId === a.id);
                        return (
                          <button
                            key={a.id}
                            type="button"
                            title={a.name}
                            aria-pressed={on}
                            disabled={!on && picks.length >= RULES.maxAssets}
                            onClick={() => toggle(a.id)}
                            className={`num border px-2 py-1 text-xs disabled:opacity-30 ${on ? "border-accent bg-accent text-accent-ink" : "border-border text-muted hover:border-border-strong hover:text-text"}`}
                          >
                            {a.id}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {picks.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Weights · whole %, 5–50 each</Label>
                    <button
                      type="button"
                      onClick={() => {
                        setManual(false);
                        setPicks(evenSplit(picks.map((p) => p.assetId)));
                      }}
                      className="font-mono text-[11px] text-muted hover:text-text"
                    >
                      Split evenly
                    </button>
                  </div>
                  <div className="border-t border-border">
                    {picks.map((p) => {
                      const bad = !Number.isInteger(p.pct) || p.pct < 5 || p.pct > 50;
                      return (
                        <div key={p.assetId} className="flex items-center gap-3 border-b border-border py-2">
                          <span className="num w-14 text-sm">{p.assetId}</span>
                          <span className="hidden flex-1 truncate text-xs text-muted sm:block">{getAsset(p.assetId).name}</span>
                          <span className="flex-1 sm:hidden" />
                          <button type="button" aria-label={`Less ${p.assetId}`} onClick={() => setPct(p.assetId, Math.max(5, Math.round(p.pct) - 1))} className="num h-7 w-7 border border-border text-muted hover:text-text">
                            −
                          </button>
                          <input
                            inputMode="numeric"
                            aria-label={`${p.assetId} weight`}
                            value={Number.isFinite(p.pct) ? String(p.pct) : ""}
                            onChange={(e) => setPct(p.assetId, e.target.value === "" ? NaN : Number(e.target.value))}
                            className={`num h-7 w-12 border bg-bg text-center text-sm ${bad ? "border-loss text-loss" : "border-border"}`}
                          />
                          <button type="button" aria-label={`More ${p.assetId}`} onClick={() => setPct(p.assetId, Math.min(50, Math.round(p.pct) + 1))} className="num h-7 w-7 border border-border text-muted hover:text-text">
                            +
                          </button>
                          <button type="button" aria-label={`Remove ${p.assetId}`} onClick={() => toggle(p.assetId)} className="px-1 font-mono text-xs text-faint hover:text-loss">
                            ×
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  <div className="num flex justify-between text-xs">
                    <span className="text-faint">
                      {picks.length} of {RULES.minAssets}–{RULES.maxAssets} assets
                    </span>
                    <span className={sum === 100 ? "text-muted" : "text-loss"}>Total {Number.isFinite(sum) ? sum : "—"}%</span>
                  </div>
                </div>
              )}

              {picks.length > 0 && weightErrors.length > 0 && (
                <ul className="space-y-1 text-xs text-loss">
                  {weightErrors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              )}

              <MinBuy minBuy={minBuy} hint={hint} />
              <Nav next={canGo[0] ? () => setStep(1) : undefined} />
            </>
          )}

          {step === 1 && (
            <div className="space-y-5">
              <Field label="Name" max={LIMITS.name} value={t.name} onChange={(v) => setT({ ...t, name: v })} placeholder="AI Picks & Shovels" />
              <Field label="Tagline" max={LIMITS.tagline} value={t.tagline} onChange={(v) => setT({ ...t, tagline: v })} placeholder="One line. What is this bag?" />
              <Field label="Thesis" max={LIMITS.thesis} rows={7} value={t.thesis} onChange={(v) => setT({ ...t, thesis: v })} placeholder="Why these assets, why together, why now." />
              {picks.map((p) => (
                <Field
                  key={p.assetId}
                  label={`Why ${p.assetId} · ${p.pct}%`}
                  max={LIMITS.why}
                  value={why[p.assetId] ?? ""}
                  onChange={(v) => setWhy({ ...why, [p.assetId]: v })}
                />
              ))}
              <Field label="Risks" max={LIMITS.risks} rows={4} value={t.risks} onChange={(v) => setT({ ...t, risks: v })} placeholder="What goes wrong, and how badly." />
              <div>
                <Label>Time horizon</Label>
                <div className="mt-2 flex gap-1">
                  {HORIZONS.map((h) => (
                    <button
                      key={h}
                      type="button"
                      aria-pressed={horizon === h}
                      onClick={() => setHorizon(h)}
                      className={`num border px-3 py-1.5 text-xs ${horizon === h ? "border-accent text-accent" : "border-border text-muted hover:text-text"}`}
                    >
                      {HORIZON_LABEL[h]}
                    </button>
                  ))}
                </div>
              </div>
              <Field label="Exit signal (optional)" max={LIMITS.exitSignal} rows={2} value={t.exitSignal} onChange={(v) => setT({ ...t, exitSignal: v })} placeholder="What would make you sell." />
              <Field
                label="Deep dive (optional · Markdown, links only, no images)"
                max={LIMITS.deepDive}
                rows={8}
                value={t.deepDive}
                onChange={(v) => setT({ ...t, deepDive: v })}
              />
              {textErrors.length > 0 && (
                <ul className="space-y-1 text-xs text-muted">
                  {textErrors.map((e) => (
                    <li key={e}>· {e}</li>
                  ))}
                </ul>
              )}
              <Nav back={() => setStep(0)} next={canGo[1] ? () => setStep(2) : undefined} />
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div>
                <Label>Your fee, on buys only</Label>
                <div className="num mt-2 text-4xl text-accent">{feePct(feeBps)}</div>
                <input
                  type="range"
                  min={0}
                  max={RULES.maxCreatorFeeBps}
                  step={RULES.creatorFeeStepBps}
                  value={feeBps}
                  onChange={(e) => setFeeBps(Number(e.target.value))}
                  aria-label="Creator fee"
                  className="mt-4 w-full accent-accent"
                />
                <div className="num mt-1 flex justify-between text-[10px] text-faint">
                  <span>0%</span>
                  <span>0.5%</span>
                  <span>1%</span>
                </div>
              </div>
              <p className="text-sm text-muted">
                On a $100 buy you get <span className="num text-text">${(feeBps / 100).toFixed(2)}</span>. The platform takes{" "}
                <span className="num text-text">{feePct(platformFeeBps)}</span>. Selling is free. The fee is frozen once you publish.
              </p>
              <MinBuy minBuy={minBuy} hint={hint} />
              <Nav back={() => setStep(1)} next={() => setStep(3)} />
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <div className="space-y-3 border border-border p-4">
                <div>
                  <div className="text-lg font-medium">{t.name}</div>
                  <div className="text-sm text-muted">{t.tagline}</div>
                </div>
                <div className="num flex flex-wrap gap-1.5 text-xs">
                  {picks.map((p) => (
                    <span key={p.assetId} className="border border-border px-2 py-1">
                      {p.assetId} <span className="text-faint">{p.pct}%</span>
                    </span>
                  ))}
                </div>
                <div className="num grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <Label>Fee</Label>
                    {feePct(feeBps)}
                  </div>
                  <div>
                    <Label>Horizon</Label>
                    {horizon ? HORIZON_LABEL[horizon] : "—"}
                  </div>
                  <div>
                    <Label>Min buy</Label>
                    <span className="text-accent">{minBuy == null ? "—" : `$${minBuy}`}</span>
                  </div>
                </div>
              </div>

              {user?.isAdmin && (
                <label className="flex cursor-pointer items-start gap-3 text-sm">
                  <input type="checkbox" checked={house} onChange={(e) => setHouse(e.target.checked)} className="mt-1 accent-accent" />
                  <span>
                    House basket. <span className="text-muted">Goes live now with no self-buy, labelled &ldquo;House basket&rdquo; everywhere.</span>
                  </span>
                </label>
              )}

              <label className="flex cursor-pointer items-start gap-3 text-sm">
                <input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} className="mt-1 accent-accent" />
                <span className="text-muted">
                  I get it: backtests are history, not a promise. Tokenized stocks are price exposure only. My thesis isn&apos;t financial advice, and assets, weights, fee and
                  name can&apos;t change after this.
                </span>
              </label>

              {!(user?.isAdmin && house) && minBuy != null && (
                <p className="text-sm">
                  Next: <span className="text-muted">publish by buying at least</span> <span className="num text-accent">${minBuy}</span>{" "}
                  <span className="text-muted">of your basket. It stays pending until that buy completes.</span>
                </p>
              )}

              {publishErr && (
                <ul className="space-y-1 text-xs text-loss">
                  {publishErr.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              )}

              <div className="flex items-center gap-3">
                <button type="button" onClick={() => setStep(2)} className="border border-border px-4 py-2 font-mono text-xs text-muted hover:text-text">
                  Back
                </button>
                <button
                  type="button"
                  disabled={!user || !accept || publishing || !canGo[0] || !canGo[1]}
                  onClick={publish}
                  className="bg-accent px-5 py-2 font-mono text-xs font-semibold text-accent-ink disabled:opacity-40"
                >
                  {publishing ? "Publishing…" : user?.isAdmin && house ? "Publish House basket" : "Publish"}
                </button>
                {!user && <span className="text-xs text-muted">Connect a wallet first.</span>}
              </div>
            </div>
          )}
        </div>

        <aside className="min-w-0 space-y-6 lg:border-l lg:border-border lg:pl-10">
          <div className="flex items-baseline justify-between">
            <Label>Live preview</Label>
            {preview.loading && <span className="font-mono text-[10px] text-faint">updating…</span>}
          </div>
          {weightErrors.length > 0 ? (
            <p className="text-sm text-muted">Pick 2–10 assets with weights that add to 100% to see the backtest.</p>
          ) : preview.error ? (
            <p className="text-sm text-loss">{preview.error}</p>
          ) : preview.data ? (
            <div className={`space-y-10 ${preview.loading ? "opacity-60" : ""}`}>
              <BacktestView a={preview.data} compact />
              <Pairs a={preview.data} compact />
            </div>
          ) : (
            <div className="h-64 border border-border" />
          )}
        </aside>
      </div>
    </div>
  );
}

function Nav({ back, next }: { back?: () => void; next?: () => void }) {
  return (
    <div className="flex gap-3 pt-2">
      {back && (
        <button type="button" onClick={back} className="border border-border px-4 py-2 font-mono text-xs text-muted hover:text-text">
          Back
        </button>
      )}
      <button type="button" disabled={!next} onClick={next} className="bg-accent px-5 py-2 font-mono text-xs font-semibold text-accent-ink disabled:opacity-40">
        Next
      </button>
    </div>
  );
}

function MinBuy({ minBuy, hint }: { minBuy: number | null; hint: string | null }) {
  return (
    <div className="border border-border p-3">
      <div className="flex items-baseline justify-between">
        <Label>Minimum buy</Label>
        <span className="num text-lg text-accent">{minBuy == null ? "—" : `$${minBuy}`}</span>
      </div>
      <p className="mt-1 text-xs text-muted">
        {hint ?? "Every asset has a smallest trade the market will fill. The basket's minimum is set by the leg that hits it first, after fees. Floor $20."}
      </p>
    </div>
  );
}

/** Which leg sets the minimum, and what a bigger weight would do. Null when the $20 floor decides. */
function minBuyHint(weights: { assetId: string; weightBps: number }[], feeBps: number): string | null {
  const current = minBuyUsd(weights, feeBps);
  if (current <= RULES.minBuyFloorUsd) return null;
  const keep = 1 - feeBps / 10_000;
  let worst: { assetId: string; weightBps: number; need: number } | null = null;
  for (const w of weights) {
    const a = getAsset(w.assetId);
    if (!a.minLegUsd) continue;
    const need = a.minLegUsd / ((w.weightBps / 10_000) * keep);
    if (!worst || need > worst.need) worst = { ...w, need };
  }
  if (!worst) return null;
  const a = getAsset(worst.assetId);
  const pct = worst.weightBps / 100;
  const base = `${a.id} at ${pct}% sets this: its smallest trade is about $${a.minLegUsd}.`;
  if (pct >= 50 || (a.kind !== "stock" && a.kind !== "etf")) return base;
  const up = Math.min(50, pct + 10);
  const better = minBuyUsd(
    weights.map((w) => (w.assetId === a.id ? { ...w, weightBps: up * 100 } : w)),
    feeBps,
  );
  return better < current ? `${base} At ${up}% the minimum would drop to $${better}.` : base;
}

/** Debounced analytics preview for valid weights. */
function usePreview(weights: { assetId: string; weightBps: number }[] | null) {
  const [state, setState] = useState<{ data: AnalyticsView | null; error: string | null; loading: boolean }>({ data: null, error: null, loading: false });
  const key = weights ? JSON.stringify(weights) : null;
  const ctrl = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!key) return;
    const timer = setTimeout(async () => {
      ctrl.current?.abort();
      const c = new AbortController();
      ctrl.current = c;
      setState((s) => ({ ...s, loading: true }));
      try {
        const r = await fetch("/api/analytics/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ weights: JSON.parse(key) }), signal: c.signal });
        const j = await r.json();
        if (!r.ok) setState({ data: null, error: (j.errors ?? [j.error]).join(" "), loading: false });
        else setState({ data: j.analytics, error: null, loading: false });
      } catch (e) {
        if ((e as Error).name !== "AbortError") setState((s) => ({ ...s, error: "Preview failed. Try again.", loading: false }));
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [key]);

  return state;
}
