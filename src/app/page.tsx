// Day 0 placeholder for Explore: seed baskets with real backtests from the database.
// Replaced by the full Explore page (tabs, cards, live stats) on Day 3.
import { connection } from "next/server";
import { Suspense } from "react";
import { getBasketAnalytics } from "@/lib/analytics/cached";
import { SEED_BASKETS } from "@/lib/seeds";

const pct = (x: number | null | undefined, digits = 1) =>
  x == null ? "—" : `${x >= 0 ? "+" : ""}${(x * 100).toFixed(digits)}%`;
const tone = (x: number | null | undefined) => (x == null ? "text-muted" : x >= 0 ? "text-gain" : "text-loss");

export default function Home() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="font-mono text-2xl font-semibold tracking-tight">Bag it. Any chain. Your keys.</h1>
        <p className="max-w-xl text-sm text-muted">
          Creator-made baskets of tokenized US stocks and crypto. Every position sits in its own NEAR Intents account that only you control.
        </p>
      </div>

      <Suspense fallback={<div className="num border border-border p-4 text-xs text-muted">Loading baskets…</div>}>
        <SeedTable />
      </Suspense>
    </div>
  );
}

async function SeedTable() {
  await connection(); // request-time only: the build never touches the database
  const rows = await Promise.all(SEED_BASKETS.map(async (b) => ({ b, a: await getBasketAnalytics(b.weights) })));
  return (
      <div className="divide-y divide-border border border-border">
        {rows.map(({ b, a }) => (
          <div key={b.slug} className="grid gap-3 p-4 sm:grid-cols-[1.4fr_1fr_1fr_1fr] sm:items-center">
            <div>
              <div className="text-sm font-medium">{b.name}</div>
              <div className="num mt-1 text-xs text-muted">
                {b.weights.map((w) => `${w.assetId} ${w.weightBps / 100}%`).join(" · ")}
              </div>
            </div>
            {"error" in a ? (
              <div className="num text-xs text-loss sm:col-span-3">{a.error}</div>
            ) : (
              <>
                <Stat label={`$1,000 since ${a.start.slice(0, 7)}`} value={`$${a.value.at(-1)!.toFixed(0)}`} sub={`SPY $${a.benchmarks.SPY?.at(-1)?.toFixed(0) ?? "—"}`} />
                <Stat
                  label="CAGR 1y / 3y / 5y"
                  value={
                    <>
                      <span className={tone(a.windows["1y"]?.cagr)}>{pct(a.windows["1y"]?.cagr, 0)}</span>
                      {" / "}
                      <span className={tone(a.windows["3y"]?.cagr)}>{pct(a.windows["3y"]?.cagr, 0)}</span>
                      {" / "}
                      <span className={tone(a.windows["5y"]?.cagr)}>{pct(a.windows["5y"]?.cagr, 0)}</span>
                    </>
                  }
                />
                <Stat label="Worst drop · Diversification" value={`${pct(a.stats.maxDrawdown, 0)} · ${pct(a.diversification, 0).replace("+", "")}`} />
              </>
            )}
          </div>
        ))}
      </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-wider text-faint">{label}</div>
      <div className="num mt-1 text-sm">{value}</div>
      {sub && <div className="num text-[11px] text-muted">{sub}</div>}
    </div>
  );
}
