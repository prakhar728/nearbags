// Creators leaderboard: every creator with a public bag, ranked by people who bought their bags (not counting
// themselves), then money held across their bags, then 30-day volume. House bags are the platform's, not a creator's,
// so they're left out. Built from the cached card numbers, so it costs no database read per visit.
import type { BasketView } from "@/lib/baskets";
import type { LiveMetrics } from "@/lib/metrics";

export interface BoardCard {
  basket: Pick<BasketView, "id" | "slug" | "name" | "isHouse" | "creator" | "publishedAt">;
  live: { value: number; days: number } | null;
  metrics: Pick<LiveMetrics, "tvlUsd" | "volume30dUsd">;
}

export interface CreatorRow {
  rank: number;
  creator: BasketView["creator"];
  bags: number;
  buyers: number;
  /** Sum across their bags; null if any bag's on-chain read failed (a partial sum would under-count). */
  heldUsd: number | null;
  volume30dUsd: number;
  /** Their best bag by live return, among bags live at least `minDays`. */
  best: { slug: string; name: string; live: number } | null;
}

export function creatorBoard(cards: BoardCard[], buyersByCreator: Record<number, number>, minDays = 7): CreatorRow[] {
  const by = new Map<number, BoardCard[]>();
  for (const c of cards) {
    if (c.basket.isHouse) continue;
    by.set(c.basket.creator.id, [...(by.get(c.basket.creator.id) ?? []), c]);
  }
  const rows = [...by.values()].map((bags): Omit<CreatorRow, "rank"> => {
    const held = bags.map((b) => b.metrics.tvlUsd);
    const ranked = bags.filter((b) => b.live && b.live.days >= minDays).sort((a, b) => b.live!.value - a.live!.value);
    const top = ranked[0];
    return {
      creator: bags[0].basket.creator,
      bags: bags.length,
      buyers: buyersByCreator[bags[0].basket.creator.id] ?? 0,
      heldUsd: held.some((x) => x == null) ? null : held.reduce<number>((s, x) => s + (x ?? 0), 0),
      volume30dUsd: bags.reduce((s, b) => s + b.metrics.volume30dUsd, 0),
      best: top ? { slug: top.basket.slug, name: top.basket.name, live: top.live!.value } : null,
    };
  });
  rows.sort(
    (a, b) =>
      b.buyers - a.buyers ||
      (b.heldUsd ?? -1) - (a.heldUsd ?? -1) ||
      b.volume30dUsd - a.volume30dUsd ||
      b.bags - a.bags ||
      a.creator.id - b.creator.id,
  );
  return rows.map((r, i) => ({ ...r, rank: i + 1 }));
}
