"use client";
// Backtest block for the basket page and the studio preview (spec §5.2.2–4): $1,000 chart vs SPY and BTC with a
// window toggle, stat row, per-asset growth chart with click-to-highlight, contribution bars.
import { useMemo, useState } from "react";
import { LineChart, type ChartLine } from "@/components/charts/LineChart";
import type { AnalyticsView, WindowKey } from "@/lib/analytics/view";
import { pct, tone, usd } from "@/lib/format";
import { assetColor, BENCH } from "@/lib/palette";

const ACCENT = "#e8ff59";
const DIM = "#2a2a2a";

export function BacktestView({ a, compact = false }: { a: AnalyticsView; compact?: boolean }) {
  const [key, setKey] = useState<WindowKey>(a.windows.at(-1)!.key);
  const [monthly, setMonthly] = useState(false);
  const w = a.windows.find((x) => x.key === key) ?? a.windows.at(-1)!;

  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1" role="tablist" aria-label="Backtest window">
            {a.windows.map((x) => (
              <button
                key={x.key}
                type="button"
                role="tab"
                aria-selected={x.key === w.key}
                onClick={() => setKey(x.key)}
                className={`num border px-2.5 py-1 text-[11px] ${x.key === w.key ? "border-accent text-accent" : "border-border text-muted hover:border-border-strong hover:text-text"}`}
              >
                {x.label}
              </button>
            ))}
          </div>
          <label className="flex cursor-pointer items-center gap-2 font-mono text-[11px] text-muted">
            <input type="checkbox" checked={monthly} onChange={(e) => setMonthly(e.target.checked)} className="accent-[var(--accent)]" />
            Show monthly-rebalanced line
          </label>
        </div>
        <GrowthChart w={w} monthly={monthly} height={compact ? 220 : 300} />
        <p className="font-mono text-[10px] leading-relaxed text-faint">
          Historical, not a forecast. Buy-and-hold from {w.start} at target weights, dividends reinvested net of 30% withholding, no fees.
          {monthly && " The dashed line resets to target weights each month. Nobody does that for you here: baskets are buy-and-hold."}
          {a.limitedBy && ` History starts ${a.limitedBy.since}: ${a.limitedBy.assetId} has no older prices.`}
        </p>
        <StatRow a={a} w={w} compact={compact} />
      </section>

      <section className="space-y-4">
        <H>Each asset, rebased to 100</H>
        <AssetChart a={a} w={w} height={compact ? 200 : 260} />
      </section>

      <section className="space-y-4">
        <H>Where the return came from · {w.label}</H>
        <Contributions a={a} w={w} />
      </section>
    </div>
  );
}

function H({ children }: { children: React.ReactNode }) {
  return <h2 className="font-mono text-[11px] uppercase tracking-wider text-muted">{children}</h2>;
}

function GrowthChart({ w, monthly, height }: { w: AnalyticsView["windows"][number]; monthly: boolean; height: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const i = hover ?? w.times.length - 1;
  const lines = useMemo(() => {
    const out: (ChartLine & { label: string })[] = [];
    if (w.btc) out.push({ id: "BTC", label: "BTC", color: BENCH.BTC, data: w.btc, dashed: true });
    if (w.spy) out.push({ id: "SPY", label: "SPY", color: BENCH.SPY, data: w.spy });
    if (monthly && w.monthly) out.push({ id: "monthly", label: "Monthly reset", color: "#9aa64a", data: w.monthly, dashed: true, width: 1 });
    out.push({ id: "basket", label: "Basket", color: ACCENT, data: w.value, width: 2 });
    return out;
  }, [w, monthly]);
  const end = w.value[i];

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-wider text-faint">
            $1,000 on {w.start} → {hover == null ? "today" : w.times[i]}
          </div>
          <div className="num mt-1 text-3xl text-accent">{usd(end)}</div>
          <div className={`num text-xs ${tone(end / 1000 - 1)}`}>{pct(end / 1000 - 1)}</div>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {[...lines].reverse().map((l) => (
            <span key={l.id} className="num flex items-center gap-1.5 text-xs text-muted">
              <span className="inline-block h-px w-4" style={{ background: l.color, height: l.width === 2 ? 2 : 1, borderTop: l.dashed ? `1px dashed ${l.color}` : undefined }} />
              {l.label} <span className="text-text">{usd(l.data[i])}</span>
            </span>
          ))}
        </div>
      </div>
      <div className="mt-3">
        <LineChart times={w.times} lines={lines} height={height} format={(v) => usd(v)} onHover={setHover} />
      </div>
    </div>
  );
}

function StatRow({ a, w, compact }: { a: AnalyticsView; w: AnalyticsView["windows"][number]; compact: boolean }) {
  const s = w.stats;
  const items: [string, React.ReactNode][] = [
    ["CAGR 1Y", <span key="1" className={tone(a.cagr["1y"])}>{pct(a.cagr["1y"])}</span>],
    ["CAGR 3Y", <span key="3" className={tone(a.cagr["3y"])}>{pct(a.cagr["3y"])}</span>],
    ["CAGR 5Y", <span key="5" className={tone(a.cagr["5y"])}>{pct(a.cagr["5y"])}</span>],
    [`Worst drop · ${w.label}`, <span key="d" className="text-loss">{pct(s.maxDrawdown, 0)}</span>],
    [`Volatility · ${w.label}`, pct(s.volatility, 0, false)],
    [`Sharpe (rf 0) · ${w.label}`, s.sharpe == null ? "—" : s.sharpe.toFixed(2)],
  ];
  return (
    <div>
      <div className={`grid grid-cols-2 border-l border-t border-border sm:grid-cols-3 ${compact ? "" : "lg:grid-cols-6"}`}>
        {items.map(([k, v]) => (
          <div key={k} className="border-b border-r border-border p-3">
            <div className="font-mono text-[10px] uppercase tracking-wider text-faint">{k}</div>
            <div className="num mt-1 text-base">{v}</div>
          </div>
        ))}
      </div>
      <p className="mt-2 font-mono text-[10px] text-faint">Historical, not a forecast. CAGR shows — when the history is shorter than the window.</p>
    </div>
  );
}

function AssetChart({ a, w, height }: { a: AnalyticsView; w: AnalyticsView["windows"][number]; height: number }) {
  const [focus, setFocus] = useState<string | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [log, setLog] = useState(false);
  const i = hover ?? w.times.length - 1;
  const basket = useMemo(() => w.value.map((v) => v / 10), [w]);
  const lines = useMemo(() => {
    const out: ChartLine[] = a.assetIds.map((id, k) => ({
      id,
      color: focus && focus !== id ? DIM : assetColor(k),
      width: focus === id ? 2 : 1,
      data: w.assets[id],
    }));
    // Highlighted asset drawn last so it sits on top; basket always bold.
    out.sort((x, y) => Number(x.id === focus) - Number(y.id === focus));
    out.push({ id: "basket", color: focus && focus !== "basket" ? "#6b7330" : ACCENT, width: 3, data: basket });
    return out;
  }, [a.assetIds, w, focus, basket]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        <LegendBtn active={focus === "basket"} dim={!!focus && focus !== "basket"} color={ACCENT} onClick={() => setFocus(focus === "basket" ? null : "basket")}>
          BASKET <span className="text-text">{basket[i]?.toFixed(0)}</span>
        </LegendBtn>
        {a.assetIds.map((id, k) => (
          <LegendBtn key={id} active={focus === id} dim={!!focus && focus !== id} color={assetColor(k)} onClick={() => setFocus(focus === id ? null : id)}>
            {id} <span className="text-text">{w.assets[id]?.[i]?.toFixed(0)}</span>
          </LegendBtn>
        ))}
        <button type="button" onClick={() => setLog(!log)} className={`num ml-auto border px-2 py-1 text-[10px] ${log ? "border-accent text-accent" : "border-border text-muted hover:text-text"}`}>
          LOG
        </button>
      </div>
      <div className="mt-3">
        <LineChart times={w.times} lines={lines} height={height} format={(v) => v.toFixed(0)} onHover={setHover} logScale={log} />
      </div>
      <p className="mt-1 font-mono text-[10px] text-faint">Click an asset to highlight it. 100 = its price on {w.start}.</p>
    </div>
  );
}

function LegendBtn({ children, active, dim, color, onClick }: { children: React.ReactNode; active: boolean; dim: boolean; color: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`num flex items-center gap-1.5 border px-2 py-1 text-[11px] ${active ? "border-border-strong bg-surface-2" : "border-border"} ${dim ? "text-faint" : "text-muted"} hover:text-text`}
    >
      <span className="inline-block h-2 w-2" style={{ background: dim ? DIM : color }} />
      {children}
    </button>
  );
}

function Contributions({ a, w }: { a: AnalyticsView; w: AnalyticsView["windows"][number] }) {
  const rows = a.assetIds.map((id) => ({ id, c: w.contributions[id] ?? 0, weight: a.weights[id] }));
  const max = Math.max(1e-9, ...rows.map((r) => Math.abs(r.c)));
  const hasNeg = rows.some((r) => r.c < 0);
  const total = w.stats.totalReturn;
  return (
    <div>
      <div className="space-y-2">
        {rows.map((r) => {
          const frac = Math.abs(r.c) / max;
          return (
            <div key={r.id} className="grid grid-cols-[4rem_1fr_5.5rem] items-center gap-3">
              <div className="num text-xs">
                {r.id} <span className="text-faint">{Math.round(r.weight * 100)}%</span>
              </div>
              <div className="relative h-4">
                {hasNeg && <div className="absolute inset-y-0 left-1/2 w-px bg-border-strong" />}
                <div
                  className={`absolute inset-y-0.5 ${r.c >= 0 ? "bg-gain/70" : "bg-loss/70"}`}
                  style={
                    hasNeg
                      ? r.c >= 0
                        ? { left: "50%", width: `${frac * 50}%` }
                        : { right: "50%", width: `${frac * 50}%` }
                      : { left: 0, width: `${frac * 100}%` }
                  }
                />
              </div>
              <div className={`num text-right text-xs ${tone(r.c)}`}>{pct(r.c)}</div>
            </div>
          );
        })}
      </div>
      <p className="mt-3 font-mono text-[10px] leading-relaxed text-faint">
        Each bar is the asset&apos;s share of the basket&apos;s {pct(total)} over {w.label}, in percentage points of the starting $1,000. They add up to the total. Historical, not a forecast.
      </p>
    </div>
  );
}
