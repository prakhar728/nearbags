// Total-return series matching how Ondo tokens behave: each cash dividend is reinvested on its ex-date,
// net of 30% US withholding (Ondo Global Markets is a BVI issuer).
import { median } from "./median";
import type { Dividend } from "./sources";

export const WITHHOLDING = 0.3;
const DAY = 86_400_000;

/** Merge dividends from several sources: events within 3 days are the same dividend; amount = median. */
export function consensusDividends(bySource: Dividend[][]): Dividend[] {
  const all = bySource.flat().sort((a, b) => a.date.localeCompare(b.date));
  const groups: Dividend[][] = [];
  for (const d of all) {
    const g = groups[groups.length - 1];
    if (g && (Date.parse(d.date) - Date.parse(g[0].date)) / DAY <= 3) g.push(d);
    else groups.push([d]);
  }
  return groups.map((g) => {
    // Most common date in the group wins; ties go to the earliest.
    const counts = new Map<string, number>();
    for (const d of g) counts.set(d.date, (counts.get(d.date) ?? 0) + 1);
    const date = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
    return { date, amount: median(g.map((d) => d.amount)) };
  });
}

/** closes: date -> split-adjusted close. Returns date -> total-return close (same value before the first dividend). */
export function totalReturn(closes: Map<string, number>, divs: Dividend[], withholding = WITHHOLDING): Map<string, number> {
  const dates = [...closes.keys()].sort();
  const pending = [...divs].sort((a, b) => a.date.localeCompare(b.date));
  const out = new Map<string, number>();
  let factor = 1;
  let k = 0;
  for (let i = 0; i < dates.length; i++) {
    // Apply every dividend whose ex-date is on/before today (and after the previous trading day).
    while (k < pending.length && pending[k].date <= dates[i]) {
      const prev = i > 0 ? closes.get(dates[i - 1])! : NaN;
      if (pending[k].date > (dates[i - 1] ?? "") && Number.isFinite(prev) && prev > 0) {
        factor *= 1 + ((1 - withholding) * pending[k].amount) / prev;
      }
      k++;
    }
    out.set(dates[i], closes.get(dates[i])! * factor);
  }
  return out;
}
