"use client";
// Creator studio (spec §5.3): 1 assets & weights with live analytics, 2 thesis, 3 fee, 4 review + publish.
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { minMaxWeightBps } from "@/lib/agent/config";
import { BacktestView } from "@/components/basket/BacktestView";
import { BacktestSkeleton } from "@/components/basket/Skeletons";
import { Field } from "@/components/basket/CreatorTools";
import { Label, Pairs } from "@/components/basket/Pairs";
import { PageHeader } from "@/components/ui/Primitives";
import type { AnalyticsView } from "@/lib/analytics/view";
import { ASSETS, getAsset, type AssetKind } from "@/lib/assets";
import { minBuyUsd, RULES, validateWeights } from "@/lib/basket-rules";
import { HORIZON_LABEL, HORIZONS, LIMITS, markdownProblems, type Horizon } from "@/lib/basket-text";
import { useAuth } from "@/lib/client/auth";
import { feePct } from "@/lib/format";
import { AssetLogo, AssetTag } from "@/components/AssetLogo";

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
  // Moving between steps brings the step chips (and the new step under them) back into view.
  const stepsRef = useRef<HTMLOListElement>(null);
  const shownStep = useRef(step);
  useEffect(() => {
    if (shownStep.current === step) return;
    shownStep.current = step;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    stepsRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }, [step]);
  const [picks, setPicks] = useState<Choice[]>([]);
  const [manual, setManual] = useState(false);
  const [t, setT] = useState({ name: "", tagline: "", thesis: "", risks: "", exitSignal: "", deepDive: "" });
  const [horizon, setHorizon] = useState<Horizon | null>(null);
  const [why, setWhy] = useState<Record<string, string>>({});
  const [feeBps, setFeeBps] = useState(50);
  const [house, setHouse] = useState(false);
  const [agentOn, setAgentOn] = useState(false);
  const [strategy, setStrategy] = useState("");
  const [maxWeight, setMaxWeight] = useState(60);
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
          agent: agentOn ? { strategy, limits: { maxWeightBps: Math.max(maxWeight * 100, minMaxWeightBps(picks.length)) } } : undefined,
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
    <div className="space-y-10">
      <PageHeader
        kicker="Create"
        title={
          <>
            Make a <em>bag.</em>
          </>
        }
        description="Pick the assets, say why, set your fee. After publish the assets, weights, fee and name are frozen. Text stays editable, with every edit shown."
      />

      {!loading && !user && (
        <p className="callout flex items-center gap-3 text-text">
          Connect a wallet (top right) to publish. You can build and preview without one.
        </p>
      )}

      <ol ref={stepsRef} className="flex scroll-mt-24 gap-2 md:flex-wrap">
        {STEPS.map((s, i) => (
          <li key={s}>
            <button
              type="button"
              disabled={!reachable(i)}
              onClick={() => setStep(i)}
              aria-current={i === step ? "step" : undefined}
              className={`chip h-10 gap-2 pl-1.5 uppercase ${i === step ? "pr-4" : "pr-1.5 md:pr-4"} tracking-wider disabled:cursor-not-allowed disabled:opacity-40 ${i === step ? "chip-on" : i < step ? "text-text" : ""}`}
            >
              <span className={`grid h-7 w-7 place-items-center rounded-full text-[11px] ${i === step ? "bg-accent text-accent-ink" : i < step ? "bg-white/10 text-text" : "border border-[var(--line-strong)]"}`}>
                {i < step ? "✓" : i + 1}
              </span>
              {/* Phones: only the current step is named, so all four fit on one line. */}
              <span className={i === step ? "" : "max-md:sr-only"}>{s}</span>
            </button>
          </li>
        ))}
      </ol>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-8">
        <div className="card card-pad min-w-0 space-y-6 self-start">
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
                            className={`chip gap-1.5 pl-1.5 disabled:cursor-not-allowed disabled:opacity-30 ${on ? "!border-accent !bg-accent !text-accent-ink" : ""}`}
                          >
                            <AssetLogo id={a.id} size={18} />
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
                      className="btn btn-ghost btn-sm"
                    >
                      Split evenly
                    </button>
                  </div>
                  <div className="well divide-y divide-[var(--line)] px-3">
                    {picks.map((p) => {
                      const bad = !Number.isInteger(p.pct) || p.pct < 5 || p.pct > 50;
                      return (
                        <div key={p.assetId} className="flex items-center gap-2 py-2.5">
                          <span className="num flex w-20 items-center gap-2 text-sm">
                            <AssetLogo id={p.assetId} size={20} />
                            {p.assetId}
                          </span>
                          <span className="hidden flex-1 truncate text-xs text-muted sm:block">{getAsset(p.assetId).name}</span>
                          <span className="flex-1 sm:hidden" />
                          <button type="button" aria-label={`Less ${p.assetId}`} onClick={() => setPct(p.assetId, Math.max(5, Math.round(p.pct) - 1))} className="num grid h-9 w-9 place-items-center rounded-full border border-[var(--line-strong)] text-muted transition-colors hover:border-accent hover:text-accent active:scale-95">
                            −
                          </button>
                          <input
                            inputMode="numeric"
                            aria-label={`${p.assetId} weight`}
                            value={Number.isFinite(p.pct) ? String(p.pct) : ""}
                            onChange={(e) => setPct(p.assetId, e.target.value === "" ? NaN : Number(e.target.value))}
                            className={`num h-9 w-14 rounded-[var(--r-sm)] border bg-black/35 text-center text-sm outline-none focus:border-[var(--accent-line)] ${bad ? "border-loss text-loss" : "border-[var(--line-strong)]"}`}
                          />
                          <button type="button" aria-label={`More ${p.assetId}`} onClick={() => setPct(p.assetId, Math.min(50, Math.round(p.pct) + 1))} className="num grid h-9 w-9 place-items-center rounded-full border border-[var(--line-strong)] text-muted transition-colors hover:border-accent hover:text-accent active:scale-95">
                            +
                          </button>
                          <button type="button" aria-label={`Remove ${p.assetId}`} onClick={() => toggle(p.assetId)} className="grid h-9 w-9 place-items-center rounded-full font-mono text-sm text-faint transition-colors hover:bg-[var(--loss-soft)] hover:text-loss">
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
                <ul className="callout callout-warn space-y-1 text-xs text-loss">
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
                <div className="seg mt-2">
                  {HORIZONS.map((h) => (
                    <button
                      key={h}
                      type="button"
                      aria-pressed={horizon === h}
                      onClick={() => setHorizon(h)}
                      className="seg-item"
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
                <div className="big-num mt-3 text-6xl text-accent">{feePct(feeBps)}</div>
                <input
                  type="range"
                  min={0}
                  max={RULES.maxCreatorFeeBps}
                  step={RULES.creatorFeeStepBps}
                  value={feeBps}
                  onChange={(e) => setFeeBps(Number(e.target.value))}
                  aria-label="Creator fee"
                  className="mt-6 h-2 w-full cursor-pointer accent-accent"
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
              <AgentOption on={agentOn} setOn={setAgentOn} strategy={strategy} setStrategy={setStrategy} maxWeight={Math.max(maxWeight, minMaxWeightBps(picks.length) / 100)} minMax={minMaxWeightBps(picks.length) / 100} setMaxWeight={setMaxWeight} />
              <Nav back={() => setStep(1)} next={!agentOn || strategy.trim().length >= 20 ? () => setStep(3) : undefined} />
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <div className="well space-y-4 p-5">
                <div>
                  <div className="display text-3xl">{t.name}</div>
                  <div className="text-sm text-muted">{t.tagline}</div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {picks.map((p) => (
                    <span key={p.assetId} className="chip">
                      <AssetTag id={p.assetId} className="text-text" /> {p.pct}%
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
                  <input type="checkbox" checked={house} onChange={(e) => setHouse(e.target.checked)} className="check mt-0.5" />
                  <span>
                    House basket. <span className="text-muted">Goes live now with no self-buy, labelled &ldquo;House basket&rdquo; everywhere.</span>
                  </span>
                </label>
              )}

              <label className="flex cursor-pointer items-start gap-3 text-sm">
                <input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} className="check mt-0.5" />
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
                <ul className="callout callout-warn space-y-1 text-xs text-loss">
                  {publishErr.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              )}

              <div className="flex items-center gap-3">
                <button type="button" onClick={() => setStep(2)} className="btn btn-secondary">
                  Back
                </button>
                <button
                  type="button"
                  disabled={!user || !accept || publishing || !canGo[0] || !canGo[1]}
                  onClick={publish}
                  className="btn btn-primary"
                >
                  {publishing ? "Publishing…" : user?.isAdmin && house ? "Publish House basket" : "Publish"}
                </button>
                {!user && <span className="text-xs text-muted">Connect a wallet first.</span>}
              </div>
            </div>
          )}
        </div>

        <aside className="min-w-0 space-y-5 lg:sticky lg:top-24 lg:self-start">
          <div className="flex items-center justify-between">
            <Label>Live preview</Label>
            {preview.loading && (
              <span className="badge badge-accent">updating</span>
            )}
          </div>
          {weightErrors.length > 0 ? (
            <div className="card grid min-h-64 place-items-center p-8 text-center">
              <p className="max-w-xs text-sm text-muted">Pick 2–10 assets with weights that add to 100% to see the backtest.</p>
            </div>
          ) : preview.error ? (
            <p className="callout callout-warn text-loss">{preview.error}</p>
          ) : preview.data ? (
            <div className={`space-y-6 transition-opacity ${preview.loading ? "opacity-60" : ""}`}>
              <BacktestView a={preview.data} compact />
              <div className="card p-4 sm:p-5">
                <Pairs a={preview.data} compact />
              </div>
            </div>
          ) : (
            <BacktestSkeleton compact assets={weights.length || 4} label="Running the preview backtest" />
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
        <button type="button" onClick={back} className="btn btn-secondary">
          Back
        </button>
      )}
      <button type="button" disabled={!next} onClick={next} className="btn btn-primary">
        Next
      </button>
    </div>
  );
}

function MinBuy({ minBuy, hint }: { minBuy: number | null; hint: string | null }) {
  return (
    <div className="well p-4">
      <div className="flex items-baseline justify-between">
        <Label>Minimum buy</Label>
        <span className="big-num text-2xl text-accent">{minBuy == null ? "—" : `$${minBuy}`}</span>
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

/** Opt the basket into the AI agent: a private strategy, and a cap on any one asset's weight. */
function AgentOption(p: { on: boolean; setOn: (v: boolean) => void; strategy: string; setStrategy: (v: string) => void; maxWeight: number; minMax: number; setMaxWeight: (v: number) => void }) {
  return (
    <div className="well space-y-4 p-5">
      <label className="flex cursor-pointer items-start gap-3">
        <input type="checkbox" checked={p.on} onChange={(e) => p.setOn(e.target.checked)} className="mt-1 h-4 w-4 accent-accent" />
        <span>
          <span className="font-medium text-text">Let an AI agent manage the weights</span>
          <span className="mt-1 block text-sm text-muted">
            Once a day the agent reads the market and your strategy, picks new weights within the limits, and rebalances every holder who opted
            in. It runs in sealed hardware on OutLayer, and it can only swap between this basket&rsquo;s assets inside each holder&rsquo;s own
            account. Holders see each decision and its proof. Your strategy stays private.
          </span>
        </span>
      </label>
      {p.on && (
        <div className="space-y-4">
          <div>
            <Label>Strategy (private)</Label>
            <textarea
              value={p.strategy}
              onChange={(e) => p.setStrategy(e.target.value.slice(0, 2000))}
              rows={5}
              placeholder="e.g. Lean into whatever has the strongest 7-day momentum, but never let stocks fall under half the basket. Cut anything down more than 15% in a week."
              className="field mt-2 w-full"
            />
            <div className="num mt-1 text-right text-[10px] text-faint">{p.strategy.length}/2000</div>
          </div>
          <div>
            <Label>Most any one asset can be: {p.maxWeight}%</Label>
            <input type="range" min={Math.ceil(p.minMax / 5) * 5} max={80} step={5} value={Math.max(p.maxWeight, Math.ceil(p.minMax / 5) * 5)} onChange={(e) => p.setMaxWeight(Number(e.target.value))} aria-label="Max weight per asset" className="mt-3 h-2 w-full cursor-pointer accent-accent" />
          </div>
          <p className="text-sm text-muted">
            Fixed limits: each asset stays at 5% or more, moves at most 15 points a day, and at most 20% of the basket changes hands per run.
          </p>
        </div>
      )}
    </div>
  );
}
