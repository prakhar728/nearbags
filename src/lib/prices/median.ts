// Combine several sources into one reference close per date (spec §7.1).
// 3+ sources: drop any source > OUTLIER_PCT from the median, then take the median of the rest.
// 2 sources: average them; if they disagree by more than 2 × OUTLIER_PCT, keep the primary source and flag the other.
// 1 source: use it.
import type { Bar, SourceName } from "./sources";

export const OUTLIER_PCT = 0.005;

export interface MedianBar {
  date: string;
  close: number;
  sourcesUsed: SourceName[];
  flagged: SourceName[];
}

export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function combine(bySource: Partial<Record<SourceName, Bar[]>>, primary: SourceName[]): MedianBar[] {
  const byDate = new Map<string, { source: SourceName; close: number }[]>();
  for (const [source, bars] of Object.entries(bySource) as [SourceName, Bar[]][]) {
    for (const b of bars ?? []) {
      const list = byDate.get(b.date) ?? [];
      list.push({ source, close: b.close });
      byDate.set(b.date, list);
    }
  }

  const out: MedianBar[] = [];
  for (const [date, quotes] of byDate) {
    if (quotes.length === 1) {
      out.push({ date, close: quotes[0].close, sourcesUsed: [quotes[0].source], flagged: [] });
      continue;
    }
    if (quotes.length === 2) {
      const [a, b] = quotes;
      const gap = Math.abs(a.close - b.close) / ((a.close + b.close) / 2);
      if (gap <= 2 * OUTLIER_PCT) {
        out.push({ date, close: (a.close + b.close) / 2, sourcesUsed: [a.source, b.source], flagged: [] });
      } else {
        const rank = (s: SourceName) => (primary.indexOf(s) === -1 ? 99 : primary.indexOf(s));
        const [keep, drop] = rank(a.source) <= rank(b.source) ? [a, b] : [b, a];
        out.push({ date, close: keep.close, sourcesUsed: [keep.source], flagged: [drop.source] });
      }
      continue;
    }
    const m = median(quotes.map((q) => q.close));
    const ok = quotes.filter((q) => Math.abs(q.close - m) / m <= OUTLIER_PCT);
    const kept = ok.length ? ok : quotes;
    out.push({
      date,
      close: median(kept.map((q) => q.close)),
      sourcesUsed: kept.map((q) => q.source),
      flagged: quotes.filter((q) => !kept.includes(q)).map((q) => q.source),
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
