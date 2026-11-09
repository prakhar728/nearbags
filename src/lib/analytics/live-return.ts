// Live return since publish (spec §7.3): buy-and-hold index from published_at on median reference closes.
// Pure function; the cached DB wrapper is in ./cached.ts.
import type { Holding, Series } from "./backtest";

export interface LiveReturn {
  value: number; // fraction, e.g. 0.042
  since: string; // publish date (YYYY-MM-DD)
  asOf: string; // latest reference close used
  days: number; // whole days since publish
}

/** Last close on or before `date`, else the first close after it. */
function closeAt(s: Map<string, number>, date: string): number | null {
  let best: string | null = null;
  let after: string | null = null;
  for (const d of s.keys()) {
    if (d <= date) {
      if (!best || d > best) best = d;
    } else if (!after || d < after) after = d;
  }
  const k = best ?? after;
  return k ? s.get(k)! : null;
}

function latest(s: Map<string, number>): [string, number] | null {
  let k: string | null = null;
  for (const d of s.keys()) if (!k || d > k) k = d;
  return k ? [k, s.get(k)!] : null;
}

export function liveReturn(holdings: Holding[], series: Series, publishedAt: string, now = Date.now()): LiveReturn | null {
  const since = publishedAt.slice(0, 10);
  let value = 0;
  let asOf = "";
  for (const h of holdings) {
    if (h.kind === "stable") continue;
    const s = series.get(h.ticker);
    if (!s?.size) return null;
    const p0 = closeAt(s, since);
    const last = latest(s);
    if (p0 == null || !last) return null;
    value += h.weight * (last[1] / p0 - 1);
    if (last[0] > asOf) asOf = last[0];
  }
  const days = Math.max(0, Math.floor((now - Date.parse(publishedAt)) / 86_400_000));
  return { value, since, asOf: asOf || since, days };
}
