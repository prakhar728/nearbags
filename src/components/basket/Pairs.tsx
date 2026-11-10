// Pairs readout in plain words + diversification score + full correlation heatmap behind a toggle (spec §5.2.5).
// No hooks: renders on the server for the basket page and inside the studio preview.
import type { AnalyticsView } from "@/lib/analytics/view";

function words(rho: number) {
  if (rho >= 0.8) return "move almost in lockstep";
  if (rho >= 0.6) return "move together";
  if (rho >= 0.5) return "tend to move together";
  if (rho <= -0.3) return "offset each other";
  if (rho < 0) return "lean opposite ways";
  return "barely move together";
}

const rhoStr = (r: number) => `${r < 0 ? "−" : ""}${Math.abs(r).toFixed(2)}`;

/** Diverging fill: accent-ish warm for positive (move together), cool for negative (offset). */
function cellColor(rho: number) {
  const a = Math.min(1, Math.abs(rho));
  return rho >= 0 ? `rgba(0, 192, 118, ${0.08 + a * 0.62})` : `rgba(48, 128, 255, ${0.08 + a * 0.62})`;
}

export function Pairs({ a, compact = false }: { a: AnalyticsView; compact?: boolean }) {
  const ids = a.assetIds.filter((id) => a.correlations.some((c) => c.a === id || c.b === id));
  const rho = (x: string, y: string) => (x === y ? 1 : (a.correlations.find((c) => (c.a === x && c.b === y) || (c.a === y && c.b === x))?.rho ?? null));
  const div = a.diversification;

  return (
    <div className={`grid gap-6 ${compact ? "sm:grid-cols-2" : "md:grid-cols-[1fr_1fr_auto]"}`}>
      <PairList title="Move together" items={a.pairs.together} empty="No pair moves closely together." />
      <PairList title="Offset" items={a.pairs.offset} empty="No pair offsets the other." />
      <div className={compact ? "sm:col-span-2" : "md:w-56"}>
        <Label>Diversification</Label>
        {div == null ? (
          <p className="mt-2 text-sm text-muted">—</p>
        ) : (
          <>
            <p className="big-num mt-3 text-4xl text-accent-fg">{Math.round(Math.max(0, div) * 100)}%</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              {div > 0.01 ? `Mixing cut swings by ${Math.round(div * 100)}% versus holding each asset on its own.` : "Mixing barely cut swings: these assets move as one."}
            </p>
          </>
        )}
      </div>

      {ids.length > 1 && (
        <details className={`disclosure group ${compact ? "sm:col-span-2" : "md:col-span-3"}`}>
          <summary className="btn btn-secondary btn-sm">
            <span className="group-open:hidden">Show all pairs</span>
            <span className="hidden group-open:inline">Hide pairs</span>
          </summary>
          <div className="mt-4 overflow-x-auto">
            <Heatmap ids={ids} rho={rho} />
            <p className="fine mt-2">Correlation of daily returns, last 12 months. 1 = identical moves, −1 = opposite.</p>
          </div>
        </details>
      )}
    </div>
  );
}

function PairList({ title, items, empty }: { title: string; items: { a: string; b: string; rho: number }[]; empty: string }) {
  return (
    <div>
      <Label>{title}</Label>
      {items.length ? (
        <ul className="mt-3 space-y-2.5 text-sm">
          {items.map((p) => (
            <li key={p.a + p.b} className="flex items-baseline justify-between gap-3">
              <span>
                <span className="num">{p.a}</span> <span className="text-muted">and</span> <span className="num">{p.b}</span>{" "}
                <span className="text-muted">{words(p.rho)}</span>
              </span>
              <span className="num shrink-0 text-xs text-faint">{rhoStr(p.rho)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted">{empty}</p>
      )}
    </div>
  );
}

function Heatmap({ ids, rho }: { ids: string[]; rho: (a: string, b: string) => number | null }) {
  const cell = 44;
  const pad = 52;
  const size = pad + ids.length * cell;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Correlation heatmap" className="num">
      {ids.map((id, i) => (
        <g key={id}>
          <text x={pad - 8} y={pad + i * cell + cell / 2} textAnchor="end" dominantBaseline="middle" fontSize="10" fill="var(--muted)">
            {id}
          </text>
          <text x={pad + i * cell + cell / 2} y={pad - 10} textAnchor="middle" fontSize="10" fill="var(--muted)">
            {id}
          </text>
        </g>
      ))}
      {ids.map((y, i) =>
        ids.map((x, j) => {
          const r = rho(x, y);
          return (
            <g key={x + y}>
              <rect x={pad + j * cell} y={pad + i * cell} width={cell - 2} height={cell - 2} rx={6} fill={r == null ? "var(--surface)" : i === j ? "var(--surface-2)" : cellColor(r)} />
              {r != null && i !== j && (
                <text
                  x={pad + j * cell + (cell - 2) / 2}
                  y={pad + i * cell + (cell - 2) / 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize="10"
                  fill={Math.abs(r) > 0.55 ? "var(--accent-ink)" : "var(--text)"}
                >
                  {rhoStr(r)}
                </text>
              )}
            </g>
          );
        }),
      )}
    </svg>
  );
}

export function Label({ children }: { children: React.ReactNode }) {
  return <div className="label">{children}</div>;
}
