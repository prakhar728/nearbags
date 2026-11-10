// Trade history and P&L over time for one user, across every position they ever held (open or closed).
// Money in = what the buyer sent, valued by 1Click at deposit time. Money out = sell payouts, plus withdrawn tokens
// valued at that day's reference price. Value over time = the position's units (replayed from successful legs) times
// daily median reference prices; the last point uses live prices.
import "server-only";
import { asc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { ASSETS, getAsset, USDC } from "@/lib/assets";
import { estimatedMultiplier, livePrice } from "@/lib/prices/live";
import { loadSeries } from "@/lib/prices/store";

// A buy counts (cash in, plus its USDC) from the moment its deposit arrived; its swaps already count as they settle.
const FUNDED = ["funded", "fees_paid", "legs_running", "complete", "partial"];
const PAYOUT_SEQ = 100; // same as orders.ts (not imported: orders.ts pulls in the Next router)
const DAY = 86_400_000;
const byIntents = new Map(ASSETS.map((a) => [a.intentsAssetId, a]));

export interface Trade {
  orderId: number;
  kind: "buy" | "sell" | "reset" | "withdraw";
  status: string;
  at: string;
  basket: { name: string; slug: string };
  usdIn: number | null; // buys
  usdOut: number | null; // sells and withdrawals
  sellPct: number | null;
}

export interface ClosedPosition {
  positionId: number;
  basket: { name: string; slug: string };
  usdIn: number;
  usdOut: number;
  pnlUsd: number;
  closedAt: string;
}

export interface PnlPoint {
  t: number; // Unix seconds
  valueUsd: number;
  investedUsd: number; // cumulative money in
  returnedUsd: number; // cumulative money out
  pnlUsd: number; // value + returned − invested
}

export interface History {
  trades: Trade[];
  closed: ClosedPosition[];
  series: PnlPoint[];
  totals: { investedUsd: number; returnedUsd: number; valueUsd: number; pnlUsd: number; realizedUsd: number };
}

type Units = Map<string, bigint>; // intents asset id → raw units

const add = (u: Units, id: string, d: bigint) => u.set(id, (u.get(id) ?? 0n) + d);

export async function history(userId: number): Promise<History> {
  const positions = await db().select().from(schema.positions).where(eq(schema.positions.userId, userId));
  const empty: History = { trades: [], closed: [], series: [], totals: { investedUsd: 0, returnedUsd: 0, valueUsd: 0, pnlUsd: 0, realizedUsd: 0 } };
  if (!positions.length) return empty;

  const orders = await db().select().from(schema.orders).where(inArray(schema.orders.positionId, positions.map((p) => p.id))).orderBy(asc(schema.orders.createdAt));
  if (!orders.length) return empty;
  const orderIds = orders.map((o) => o.id);
  const legs = await db().select().from(schema.orderLegs).where(inArray(schema.orderLegs.orderId, orderIds));
  const fees = await db().select().from(schema.feeEvents).where(inArray(schema.feeEvents.orderId, orderIds));
  const baskets = await db().select({ id: schema.baskets.id, name: schema.baskets.name, slug: schema.baskets.slug }).from(schema.baskets).where(inArray(schema.baskets.id, [...new Set(positions.map((p) => p.basketId))]));
  const basketOf = (positionId: number) => {
    const p = positions.find((x) => x.id === positionId)!;
    const b = baskets.find((x) => x.id === p.basketId);
    return { name: b?.name ?? "Basket", slug: b?.slug ?? "" };
  };

  // ── Events: every unit change and cash flow, in time order ─────────────────────────────────────────────────────
  type Ev = { t: number; orderId: number; positionId: number; units?: [string, bigint][]; cashIn?: number; cashOut?: number; withdrawn?: [string, bigint][] };
  const evs: Ev[] = [];
  for (const o of orders) {
    const ls = legs.filter((l) => l.orderId === o.id && l.status === "success");
    if (o.kind === "buy" && FUNDED.includes(o.status) && o.grossUsdc) {
      const quote = o.fundingQuote as { quote?: { amountInUsd?: string } } | null;
      const paid = Number(quote?.quote?.amountInUsd ?? o.usdIn ?? 0);
      const t = o.createdAt.getTime();
      evs.push({ t, orderId: o.id, positionId: o.positionId, cashIn: paid, units: o.grossUsdc ? [[USDC.intentsAssetId, BigInt(o.grossUsdc)]] : [] });
      for (const f of fees.filter((f) => f.orderId === o.id && f.status === "success")) evs.push({ t: f.createdAt.getTime(), orderId: o.id, positionId: o.positionId, units: [[f.asset, -BigInt(f.amount)]] });
    }
    for (const l of ls) {
      const t = l.updatedAt.getTime();
      if (l.seq === PAYOUT_SEQ) {
        evs.push({ t, orderId: o.id, positionId: o.positionId, units: [[l.assetFrom, -BigInt(l.amountIn)]], cashOut: Number(l.amountIn) / 1e6 });
      } else if (o.kind === "withdraw") {
        evs.push({ t, orderId: o.id, positionId: o.positionId, units: [[l.assetFrom, -BigInt(l.amountIn)]], withdrawn: [[l.assetFrom, BigInt(l.amountIn)]] });
      } else {
        evs.push({ t, orderId: o.id, positionId: o.positionId, units: [[l.assetFrom, -BigInt(l.amountIn)], ...(l.amountOutActual ? ([[l.assetTo, BigInt(l.amountOutActual)]] as [string, bigint][]) : [])] });
      }
    }
  }
  evs.sort((a, b) => a.t - b.t);

  // ── Prices: daily medians (stocks × shares-per-token), carried forward over weekends ────────────────────────────
  const held = [...new Set(evs.flatMap((e) => (e.units ?? []).map(([id]) => id)))].map((id) => byIntents.get(id)).filter((a) => a != null);
  const first = new Date(evs[0].t);
  const from = new Date(first.getTime() - 10 * DAY).toISOString().slice(0, 10);
  const tickers = [...new Set(held.filter((a) => a.id !== "USDC").map((a) => a.refTicker))];
  const series = tickers.length ? await loadSeries(tickers, from, { totalReturn: false }) : new Map<string, Map<string, number>>();
  const mult = new Map<string, number>();
  for (const a of held) if (a.kind === "stock" || a.kind === "etf") mult.set(a.id, await estimatedMultiplier(a.refTicker).catch(() => 1));
  const live = new Map<string, number>();
  for (const a of held) live.set(a.id, a.id === "USDC" ? 1 : ((await livePrice(a.id).catch(() => null))?.price ?? NaN));

  const priceOn = (assetId: string, t: number, useLive: boolean): number => {
    const a = getAsset(assetId);
    if (a.id === "USDC") return 1;
    if (useLive && Number.isFinite(live.get(a.id))) return live.get(a.id)!;
    const s = series.get(a.refTicker);
    const day = new Date(t).toISOString().slice(0, 10);
    let p: number | undefined;
    let lastDay = "";
    if (s) {
      for (const [d, c] of s) {
        if (d > day) break;
        p = c;
        lastDay = d;
      }
    }
    const latest = s ? [...s.keys()].at(-1) ?? "" : "";
    // No close yet for this day (it is today, or ingest hasn't caught up): live beats a stale close.
    if ((p == null || (day > latest && lastDay === latest)) && Number.isFinite(live.get(a.id))) return live.get(a.id)!;
    if (p == null) return 0;
    return p * (mult.get(a.id) ?? 1);
  };
  const valueOf = (u: Units, t: number, useLive: boolean) => {
    let v = 0;
    for (const [id, raw] of u) {
      const a = byIntents.get(id);
      if (!a || raw <= 0n) continue;
      v += (Number(raw) / 10 ** a.decimals) * priceOn(a.id, t, useLive);
    }
    return v;
  };

  // ── Replay ──────────────────────────────────────────────────────────────────────────────────────────────────────
  const units = new Map<number, Units>(positions.map((p) => [p.id, new Map()]));
  let invested = 0;
  let returned = 0;
  const flows = new Map<number, { in: number; out: number; lastT: number }>();
  const points: PnlPoint[] = [];
  const total = (t: number, useLive: boolean) => [...units.values()].reduce((s, u) => s + valueOf(u, t, useLive), 0);
  const point = (t: number, useLive = false) => {
    const v = total(t, useLive);
    points.push({ t: Math.floor(t / 1000), valueUsd: v, investedUsd: invested, returnedUsd: returned, pnlUsd: v + returned - invested });
  };

  const now = Date.now();
  point(evs[0].t - 1000); // the line starts at zero, just before the first deposit
  let nextDay = Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), first.getUTCDate()) + DAY;
  for (const e of evs) {
    while (nextDay < e.t) {
      point(nextDay - 1);
      nextDay += DAY;
    }
    const u = units.get(e.positionId)!;
    for (const [id, d] of e.units ?? []) add(u, id, d);
    const f = flows.get(e.positionId) ?? { in: 0, out: 0, lastT: 0 };
    invested += e.cashIn ?? 0;
    f.in += e.cashIn ?? 0;
    returned += e.cashOut ?? 0;
    f.out += e.cashOut ?? 0;
    for (const [id, raw] of e.withdrawn ?? []) {
      const a = byIntents.get(id);
      if (!a) continue;
      const usd = (Number(raw) / 10 ** a.decimals) * priceOn(a.id, e.t, false);
      returned += usd;
      f.out += usd;
    }
    f.lastT = e.t;
    flows.set(e.positionId, f);
    const next = evs[evs.indexOf(e) + 1];
    if (!next || next.orderId !== e.orderId) point(e.t);
  }
  while (nextDay < now) {
    point(nextDay - 1);
    nextDay += DAY;
  }
  point(now, true);

  // Lightweight-charts needs strictly increasing times.
  const series_: PnlPoint[] = [];
  for (const p of points) {
    if (series_.length && series_.at(-1)!.t >= p.t) series_[series_.length - 1] = { ...p, t: series_.at(-1)!.t };
    else series_.push(p);
  }

  // ── Trades and closed positions ─────────────────────────────────────────────────────────────────────────────────
  const withdrawnUsd = new Map<number, number>();
  for (const o of orders.filter((o) => o.kind === "withdraw")) {
    let usd = 0;
    for (const l of legs.filter((l) => l.orderId === o.id && l.status === "success")) {
      const a = byIntents.get(l.assetFrom);
      if (a) usd += (Number(l.amountIn) / 10 ** a.decimals) * priceOn(a.id, l.updatedAt.getTime(), false);
    }
    withdrawnUsd.set(o.id, usd);
  }
  const trades: Trade[] = orders
    .map((o) => {
      const quote = o.fundingQuote as { quote?: { amountInUsd?: string } } | null;
      return {
        orderId: o.id,
        kind: o.kind as Trade["kind"],
        status: o.status,
        at: o.createdAt.toISOString(),
        basket: basketOf(o.positionId),
        usdIn: o.kind === "buy" ? Number(quote?.quote?.amountInUsd ?? o.usdIn ?? 0) || null : null,
        usdOut: o.kind === "sell" ? (o.usdOut ?? null) : o.kind === "withdraw" ? (withdrawnUsd.get(o.id) ?? null) : null,
        sellPct: o.sellPct ?? null,
      };
    })
    .filter((t) => !(t.kind === "buy" && t.status === "awaiting_deposit" && Date.now() - Date.parse(t.at) > DAY)) // abandoned quotes
    .reverse();

  const closed: ClosedPosition[] = [];
  for (const p of positions) {
    const f = flows.get(p.id);
    if (!f || f.in === 0) continue;
    const left = valueOf(units.get(p.id)!, now, true);
    if (left > 0.01) continue;
    closed.push({ positionId: p.id, basket: basketOf(p.id), usdIn: f.in, usdOut: f.out, pnlUsd: f.out - f.in, closedAt: new Date(f.lastT).toISOString() });
  }

  const last = series_.at(-1)!;
  return {
    trades,
    closed,
    series: series_,
    totals: { investedUsd: invested, returnedUsd: returned, valueUsd: last.valueUsd, pnlUsd: last.pnlUsd, realizedUsd: closed.reduce((s, c) => s + c.pnlUsd, 0) },
  };
}
