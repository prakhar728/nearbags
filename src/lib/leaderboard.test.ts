import { describe, expect, it } from "vitest";
import { creatorBoard, type BoardCard } from "./leaderboard";

const creator = (id: number) => ({ id, handle: `c${id}`, address: `addr${id}`, chain: "near" as const });
const card = (id: number, creatorId: number, o: { held?: number | null; vol?: number; live?: [number, number] | null; house?: boolean } = {}): BoardCard => ({
  basket: { id, slug: `b${id}`, name: `Bag ${id}`, isHouse: o.house ?? false, creator: creator(creatorId), publishedAt: "2026-11-01T00:00:00Z" },
  live: o.live === undefined ? null : o.live && { value: o.live[0], days: o.live[1] },
  metrics: { tvlUsd: o.held === undefined ? 0 : o.held, volume30dUsd: o.vol ?? 0 },
});

describe("creatorBoard", () => {
  it("ranks by buyers, then held, then volume, and leaves house bags out", () => {
    const rows = creatorBoard(
      [card(1, 1, { held: 500 }), card(2, 2, { held: 100 }), card(3, 3, { held: 900 }), card(4, 9, { house: true, held: 10_000 })],
      { 1: 2, 2: 5, 3: 2, 9: 50 },
    );
    expect(rows.map((r) => [r.rank, r.creator.id])).toEqual([
      [1, 2],
      [2, 3],
      [3, 1],
    ]);
  });

  it("sums a creator's bags and picks their best bag among those live a week", () => {
    const [r] = creatorBoard([card(1, 1, { held: 10, vol: 5, live: [0.3, 3] }), card(2, 1, { held: 20, vol: 7, live: [0.1, 10] }), card(3, 1, { live: [0.05, 8] })], {});
    expect(r).toMatchObject({ bags: 3, heldUsd: 30, volume30dUsd: 12, best: { slug: "b2", live: 0.1 } });
  });

  it("shows held as unknown when any bag's read failed", () => {
    const [r] = creatorBoard([card(1, 1, { held: 10 }), card(2, 1, { held: null })], {});
    expect(r.heldUsd).toBeNull();
  });
});
