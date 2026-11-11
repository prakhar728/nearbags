"use client";
// Admin Stats tab. One cached read of the small tables (src/lib/admin-stats.ts); every sum, filter and chart is done
// here, so switching the range or hiding team wallets costs no database reads.
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Loading, Skeleton } from "@/components/ui/Skeleton";
import type { AdminStats } from "@/lib/admin-stats";
import { ago, shortAddr, usd } from "@/lib/format";

type Range = "7" | "30" | "all";
const DAY = 86_400_000;
const DONE = new Set(["complete", "partial"]);
const UNPAID = new Set(["preflight", "awaiting_deposit"]);
const RUNNING = new Set(["funded", "fees_paid", "legs_running"]);
const TEAM_KEY = "nearbags.admin.team";

const dayKey = (iso: string | number) => new Date(iso).toISOString().slice(0, 10);
const dayLabel = (key: string, weekday = false) =>
  new Date(`${key}T00:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", ...(weekday ? { weekday: "short" } : {}) });
const money = (x: number) => usd(x, { cents: Math.abs(x) < 1000 });
const stamp = (iso: string) => `${new Date(iso).toISOString().slice(0, 16).replace("T", " ")} UTC`;
const count = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/** What an order's status means to a person: finished, failed, still moving, stuck, or a quote nobody paid. */
function orderState(o: { status: string; createdAt: string }, now: number) {
  const age = now - Date.parse(o.createdAt);
  if (o.status === "complete") return "Done";
  if (o.status === "partial") return "Partial";
  if (o.status === "failed") return "Failed";
  if (o.status === "refunded") return "Refunded";
  if (UNPAID.has(o.status)) return age > 3_600_000 ? "Never paid" : "Waiting for payment";
  if (RUNNING.has(o.status)) return age > 30 * 60_000 ? "Stuck" : "In progress";
  return o.status;
}
const STATE_ORDER = ["Done", "Partial", "In progress", "Waiting for payment", "Stuck", "Failed", "Refunded", "Never paid"];
const stateBadge = (s: string) => (s === "Done" ? "badge badge-gain" : s === "Failed" || s === "Stuck" ? "badge badge-loss" : "badge");

async function fetchStats(): Promise<AdminStats> {
  const r = await fetch("/api/admin/stats", { cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? `Request failed (${r.status})`);
  return j as AdminStats;
}

function useTeamOverrides() {
  // Only rendered after sign-in is known, so this never runs on the server.
  const [over, setOver] = useState<Record<number, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem(TEAM_KEY) ?? "{}");
    } catch {
      return {};
    }
  });
  const set = (id: number, team: boolean) =>
    setOver((o) => {
      const next = { ...o, [id]: team };
      try {
        localStorage.setItem(TEAM_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  return [over, set] as const;
}

export function StatsView() {
  const q = useQuery({ queryKey: ["admin-stats"], queryFn: fetchStats, staleTime: 5 * 60_000, refetchOnWindowFocus: false });
  const [range, setRange] = useState<Range>("30");
  const [outsideOnly, setOutsideOnly] = useState(false);
  const [over, setTeam] = useTeamOverrides();

  const v = useMemo(() => (q.data ? compute(q.data, range, outsideOnly, over) : null), [q.data, range, outsideOnly, over]);

  if (q.error) return <p className="callout callout-warn text-loss">{(q.error as Error).message}</p>;
  if (!q.data || !v) return <StatsSkeleton />;
  const d = q.data;
  const rangeWord = range === "all" ? "all time" : `last ${range} days`;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-8">
      <div className="flex flex-wrap items-center gap-3">
        <div className="seg" role="group" aria-label="Date range">
          {(
            [
              ["7", "7 days"],
              ["30", "30 days"],
              ["all", "All time"],
            ] as const
          ).map(([k, label]) => (
            <button key={k} type="button" className="seg-item" aria-pressed={range === k} onClick={() => setRange(k)}>
              {label}
            </button>
          ))}
        </div>
        <div className="seg" role="group" aria-label="Wallets">
          <button type="button" className="seg-item" aria-pressed={!outsideOnly} onClick={() => setOutsideOnly(false)}>
            Everyone
          </button>
          <button type="button" className="seg-item" aria-pressed={outsideOnly} onClick={() => setOutsideOnly(true)}>
            Without team wallets
          </button>
        </div>
        <span className="fine ml-auto">Data from {ago(d.at)}. Refreshes every 5 minutes.</span>
      </div>

      <div className="stat-grid grid-cols-2 lg:grid-cols-4">
        <Tile label={range === "all" ? "Wallets" : "New wallets"} value={v.newWallets.toLocaleString("en-US")} sub={range === "all" ? `${v.teamCount} marked as team` : `${v.totalWallets} in total`} />
        <Tile label="Buyers" value={v.buyers.toLocaleString("en-US")} sub={`${v.firstTimeBuyers} bought for the first time`} />
        <Tile label="Money in" value={money(v.moneyIn)} sub={v.buys ? `${count(v.buys, "buy")}, ${money(v.moneyIn / v.buys)} average` : "No buys"} accent />
        <Tile label="Money out" value={money(v.moneyOut)} sub={v.sells ? count(v.sells, "sell") : "No sells"} />
        <Tile label="Fees earned" value={usd(v.feesCreator + v.feesPlatform, { cents: true })} sub={`Creators ${usd(v.feesCreator, { cents: true })}, platform ${usd(v.feesPlatform, { cents: true })}`} />
        <Tile
          label="Orders finished"
          value={`${v.finished} of ${v.paidOrders}`}
          sub={v.problem ? `${count(v.problem, "needs", "need")} a look` : v.paidOrders ? "Nothing failed or stuck" : "No paid orders"}
          warn={v.problem > 0}
        />
        <Tile label="Live bags" value={String(v.liveBags)} sub={`${v.agentBags} run by an agent`} />
        <Tile label="Agent runs" value={String(v.runs.length)} sub={v.runsFailed ? `${v.runsFailed} failed` : v.runs.length ? "None failed" : "None yet"} warn={v.runsFailed > 0} />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <ChartCard
          title="Money in and out per day"
          legend={[
            { color: "var(--accent-fg)", label: "In (buys)", value: money(v.moneyIn) },
            { color: "var(--muted)", label: "Out (sells)", value: money(v.moneyOut) },
          ]}
        >
          <FlowChart days={v.days} />
        </ChartCard>
        <ChartCard
          title="Wallets over time"
          legend={[
            { color: "var(--text)", label: "Signed in", value: String(v.days.at(-1)?.signed ?? 0) },
            { color: "var(--accent-fg)", label: "Bought at least once", value: String(v.days.at(-1)?.bought ?? 0) },
          ]}
        >
          <WalletChart days={v.days} />
        </ChartCard>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className="grid grid-cols-[minmax(0,1fr)] content-start gap-3">
          <h2 className="text-[15px] font-semibold tracking-tight">Bags</h2>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Bag</th>
                  <th>Status</th>
                  <th className="r">Holders</th>
                  <th className="r">In</th>
                  <th className="r">Out</th>
                  <th className="r">Creator fees</th>
                </tr>
              </thead>
              <tbody>
                {v.bags.map((b) => (
                  <tr key={b.id}>
                    <td className="min-w-[220px]">
                      <Link href={`/b/${b.slug}`} className="font-medium hover:underline">
                        {b.name}
                      </Link>
                      <span className="ml-2 text-xs text-faint">
                        {b.isHouse ? "house" : "creator"}
                        {b.hasAgent ? ", agent" : ""}
                      </span>
                    </td>
                    <td>
                      <span className={b.status === "live" ? "badge badge-gain" : "badge"}>{b.status}</span>
                    </td>
                    <td className="r">{b.holders || <span className="text-faint">0</span>}</td>
                    <td className="r">{b.in ? money(b.in) : <span className="text-faint">—</span>}</td>
                    <td className="r">{b.out ? money(b.out) : <span className="text-faint">—</span>}</td>
                    <td className="r">{b.fees ? usd(b.fees, { cents: true }) : <span className="text-faint">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="grid grid-cols-[minmax(0,1fr)] content-start gap-3">
          <h2 className="text-[15px] font-semibold tracking-tight">Orders by outcome</h2>
          <div className="card grid gap-4 p-5">
            {v.states.length === 0 && <p className="fine">No orders in the {rangeWord}.</p>}
            {v.states.map((s) => (
              <div key={s.state} className="grid gap-1.5">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span>{s.state}</span>
                  <span className="num font-medium tabular-nums">
                    {s.n} <span className="text-xs font-normal text-faint">{Math.round((s.n / v.ordersInRange) * 100)}%</span>
                  </span>
                </div>
                <div className="bar-track">
                  <div
                    className="bar-fill"
                    style={{
                      width: `${Math.max(2, (s.n / v.ordersInRange) * 100)}%`,
                      background: s.state === "Done" ? "var(--accent-fg)" : s.state === "Failed" || s.state === "Stuck" ? "var(--loss)" : "var(--muted)",
                    }}
                  />
                </div>
              </div>
            ))}
            <p className="fine">Never paid means a quote was made but no deposit arrived within an hour.</p>
          </div>
        </section>
      </div>

      <RecentOrders orders={v.recent} rangeWord={rangeWord} />

      <section className="grid grid-cols-[minmax(0,1fr)] gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-[15px] font-semibold tracking-tight">Wallets</h2>
          <span className="fine">Team wallets are left out when you pick Without team wallets. Admins and the house creator start as team.</span>
        </div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Wallet</th>
                <th>Joined</th>
                <th className="r">Bags</th>
                <th className="r">Buys</th>
                <th className="r">In</th>
                <th className="r">Out</th>
                <th className="r">Team</th>
              </tr>
            </thead>
            <tbody>
              {v.wallets.map((w) => (
                <tr key={w.id} className={outsideOnly && w.team ? "opacity-45" : ""}>
                  <td className="min-w-[220px]">
                    <span className="font-medium">{w.handle ? `@${w.handle}` : shortAddr(w.address)}</span>
                    <span className="ml-2 text-xs text-faint">
                      {w.chain === "near" ? "NEAR" : "EVM"}
                      {w.isAdmin ? ", admin" : ""}
                    </span>
                  </td>
                  <td className="whitespace-nowrap text-muted">{dayLabel(dayKey(w.createdAt))}</td>
                  <td className="r">{w.bags || <span className="text-faint">0</span>}</td>
                  <td className="r">{w.buys || <span className="text-faint">0</span>}</td>
                  <td className="r">{w.in ? money(w.in) : <span className="text-faint">—</span>}</td>
                  <td className="r">{w.out ? money(w.out) : <span className="text-faint">—</span>}</td>
                  <td className="r">
                    <input type="checkbox" aria-label="Team wallet" checked={w.team} onChange={(e) => setTeam(w.id, e.target.checked)} className="size-4 cursor-pointer accent-[var(--text)]" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid grid-cols-[minmax(0,1fr)] gap-3">
        <h2 className="text-[15px] font-semibold tracking-tight">Agent runs</h2>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>When</th>
                <th>Bag</th>
                <th>Started by</th>
                <th>Status</th>
                <th>Decision</th>
                <th className="r">Proof</th>
              </tr>
            </thead>
            <tbody>
              {v.runs.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-muted">
                    No runs in the {rangeWord}.
                  </td>
                </tr>
              )}
              {v.runs.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap text-muted" title={stamp(r.createdAt)}>
                    {ago(r.createdAt)}
                  </td>
                  <td className="whitespace-nowrap">{r.bag}</td>
                  <td className="whitespace-nowrap">{r.trigger === "cron" ? "Daily schedule" : r.trigger === "creator" ? "Creator" : "Admin"}</td>
                  <td>
                    <span className={r.status === "done" ? "badge badge-gain" : r.status === "failed" ? "badge badge-loss" : "badge"}>{r.status === "done" ? "Done" : r.status === "failed" ? "Failed" : "Running"}</span>
                  </td>
                  <td className="min-w-[320px] max-w-[640px] text-[13px] leading-relaxed text-muted">{r.error ?? r.reason ?? "—"}</td>
                  <td className="r">
                    {r.decideTx ? (
                      <a href={`/api/agent/proof/${r.decideTx}`} target="_blank" rel="noreferrer" className="whitespace-nowrap font-medium hover:underline">
                        Open ↗
                      </a>
                    ) : (
                      <span className="text-faint">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

// ---------- numbers ----------

type Computed = ReturnType<typeof compute>;
type Day = { key: string; in: number; out: number; buys: number; sells: number; signed: number; bought: number; newWallets: number };

function compute(d: AdminStats, range: Range, outsideOnly: boolean, over: Record<number, boolean>) {
  const now = Date.now();
  const houseCreators = new Set(d.baskets.filter((b) => b.isHouse).map((b) => b.creatorId));
  const isTeam = (u: AdminStats["users"][number]) => over[u.id] ?? (u.isAdmin || houseCreators.has(u.id));
  const team = new Set(d.users.filter(isTeam).map((u) => u.id));
  const keepUser = (id: number) => !(outsideOnly && team.has(id));

  const posById = new Map(d.positions.map((p) => [p.id, p]));
  const basketById = new Map(d.baskets.map((b) => [b.id, b]));
  const userById = new Map(d.users.map((u) => [u.id, u]));
  const users = d.users.filter((u) => keepUser(u.id));
  const orders = d.orders.filter((o) => {
    const p = posById.get(o.positionId);
    return p && keepUser(p.userId);
  });
  const orderById = new Map(orders.map((o) => [o.id, o]));

  // Range: whole UTC days ending today. "All" starts at the first wallet or order.
  const todayKey = dayKey(now);
  const firstKey = [...d.users.map((u) => u.createdAt), ...d.orders.map((o) => o.createdAt)].filter(Boolean).map(dayKey).sort()[0] ?? todayKey;
  const startKey = range === "all" ? firstKey : dayKey(Date.parse(`${todayKey}T00:00:00Z`) - (Number(range) - 1) * DAY);
  const inRange = (iso: string) => dayKey(iso) >= startKey;

  // First completed buy per wallet, for "bought at least once" and first-time buyers.
  const firstBuy = new Map<number, string>();
  for (const o of [...orders].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    if (o.kind !== "buy" || !DONE.has(o.status)) continue;
    const uid = posById.get(o.positionId)!.userId;
    if (!firstBuy.has(uid)) firstBuy.set(uid, o.createdAt);
  }

  const days: Day[] = [];
  const byKey = new Map<string, Day>();
  for (let t = Date.parse(`${startKey}T00:00:00Z`); dayKey(t) <= todayKey; t += DAY) {
    const day = { key: dayKey(t), in: 0, out: 0, buys: 0, sells: 0, signed: 0, bought: 0, newWallets: 0 };
    days.push(day);
    byKey.set(day.key, day);
  }
  for (const u of users) {
    const k = dayKey(u.createdAt);
    const day = byKey.get(k);
    if (day) day.newWallets++;
  }
  // Cumulative lines count everything before the range too, so the 7-day view starts at the real total.
  for (const day of days) {
    day.signed = users.filter((u) => dayKey(u.createdAt) <= day.key).length;
    day.bought = [...firstBuy.values()].filter((at) => dayKey(at) <= day.key).length;
  }

  let moneyIn = 0, moneyOut = 0, buys = 0, sells = 0;
  const buyers = new Set<number>();
  const states = new Map<string, number>();
  const bagMoney = new Map<number, { in: number; out: number; fees: number }>();
  const walletMoney = new Map<number, { in: number; out: number; buys: number }>();
  const rangeOrders = orders.filter((o) => inRange(o.createdAt));
  for (const o of rangeOrders) {
    const state = orderState(o, now);
    states.set(state, (states.get(state) ?? 0) + 1);
    if (!DONE.has(o.status)) continue;
    const p = posById.get(o.positionId)!;
    const bm = bagMoney.get(p.basketId) ?? { in: 0, out: 0, fees: 0 };
    const day = byKey.get(dayKey(o.createdAt));
    if (o.kind === "buy") {
      const x = o.usdIn ?? 0;
      moneyIn += x;
      buys++;
      buyers.add(p.userId);
      bm.in += x;
      if (day) {
        day.in += x;
        day.buys++;
      }
    } else if (o.kind === "sell") {
      const x = o.usdOut ?? 0;
      moneyOut += x;
      sells++;
      bm.out += x;
      if (day) {
        day.out += x;
        day.sells++;
      }
    }
    bagMoney.set(p.basketId, bm);
  }
  for (const o of d.orders) {
    if (!inRange(o.createdAt) || !DONE.has(o.status)) continue;
    const uid = posById.get(o.positionId)?.userId;
    if (uid == null) continue;
    const wm = walletMoney.get(uid) ?? { in: 0, out: 0, buys: 0 };
    if (o.kind === "buy") {
      wm.in += o.usdIn ?? 0;
      wm.buys++;
    } else if (o.kind === "sell") wm.out += o.usdOut ?? 0;
    walletMoney.set(uid, wm);
  }

  let feesCreator = 0, feesPlatform = 0;
  for (const f of d.fees) {
    const o = orderById.get(f.orderId);
    if (!o || f.status !== "success" || !inRange(f.createdAt)) continue;
    if (f.kind === "creator") {
      feesCreator += f.usdc;
      const bm = bagMoney.get(posById.get(o.positionId)!.basketId);
      if (bm) bm.fees += f.usdc;
    } else feesPlatform += f.usdc;
  }

  const holders = new Map<number, number>();
  const userBags = new Map<number, number>();
  for (const p of d.positions) {
    userBags.set(p.userId, (userBags.get(p.userId) ?? 0) + 1);
    if (keepUser(p.userId)) holders.set(p.basketId, (holders.get(p.basketId) ?? 0) + 1);
  }

  const statusRank = (s: string) => ["live", "pending", "draft", "closed", "hidden"].indexOf(s);
  const bags = d.baskets
    .map((b) => ({ ...b, holders: holders.get(b.id) ?? 0, ...(bagMoney.get(b.id) ?? { in: 0, out: 0, fees: 0 }) }))
    .sort((a, b) => b.in - a.in || b.holders - a.holders || statusRank(a.status) - statusRank(b.status) || a.name.localeCompare(b.name));

  const wallets = d.users
    .map((u) => ({ ...u, team: team.has(u.id), bags: userBags.get(u.id) ?? 0, ...(walletMoney.get(u.id) ?? { in: 0, out: 0, buys: 0 }) }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const recent = [...rangeOrders].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((o) => {
    const p = posById.get(o.positionId)!;
    const u = userById.get(p.userId);
    return { ...o, state: orderState(o, now), bag: basketById.get(p.basketId)?.name ?? "—", slug: basketById.get(p.basketId)?.slug, wallet: u ? (u.handle ? `@${u.handle}` : shortAddr(u.address)) : "—" };
  });

  const runs = d.runs.filter((r) => inRange(r.createdAt)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((r) => ({ ...r, bag: basketById.get(r.basketId)?.name ?? "—" }));
  const paid = rangeOrders.filter((o) => !UNPAID.has(o.status));
  const problem = (states.get("Failed") ?? 0) + (states.get("Stuck") ?? 0);

  return {
    days,
    totalWallets: users.length,
    newWallets: users.filter((u) => inRange(u.createdAt)).length,
    teamCount: team.size,
    buyers: buyers.size,
    firstTimeBuyers: [...firstBuy.values()].filter(inRange).length,
    moneyIn, moneyOut, buys, sells, feesCreator, feesPlatform,
    paidOrders: paid.length,
    finished: paid.filter((o) => DONE.has(o.status)).length,
    problem,
    ordersInRange: rangeOrders.length,
    states: STATE_ORDER.filter((s) => states.has(s)).map((s) => ({ state: s, n: states.get(s)! })),
    liveBags: d.baskets.filter((b) => b.status === "live").length,
    agentBags: d.baskets.filter((b) => b.status === "live" && b.hasAgent).length,
    runs,
    runsFailed: runs.filter((r) => r.status === "failed").length,
    bags,
    wallets,
    recent,
  };
}

// ---------- pieces ----------

function Tile({ label, value, sub, accent, warn }: { label: string; value: string; sub: string; accent?: boolean; warn?: boolean }) {
  return (
    <div className="grid content-start gap-1">
      <span className="label">{label}</span>
      <span className={`text-[28px] font-medium leading-tight tracking-[-0.03em] tabular-nums ${accent ? "text-gain" : ""}`}>{value}</span>
      <span className={`fine ${warn ? "!text-loss" : ""}`}>{sub}</span>
    </div>
  );
}

function ChartCard({ title, legend, children }: { title: string; legend: { color: string; label: string; value: string }[]; children: React.ReactNode }) {
  return (
    <section className="card grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-4 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
        <ul className="flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-muted">
          {legend.map((l) => (
            <li key={l.label} className="flex items-center gap-2">
              <span className="inline-block size-2.5 rounded-[3px]" style={{ background: l.color }} />
              {l.label}
              <b className="font-medium text-text tabular-nums">{l.value}</b>
            </li>
          ))}
        </ul>
      </div>
      {children}
    </section>
  );
}

function RecentOrders({ orders, rangeWord }: { orders: Computed["recent"]; rangeWord: string }) {
  const [all, setAll] = useState(false);
  const rows = all ? orders : orders.slice(0, 12);
  return (
    <section className="grid grid-cols-[minmax(0,1fr)] gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-semibold tracking-tight">Recent orders</h2>
        {orders.length > 12 && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAll(!all)}>
            {all ? "Show fewer" : `Show all ${orders.length}`}
          </button>
        )}
      </div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>When</th>
              <th>Wallet</th>
              <th>Bag</th>
              <th>Type</th>
              <th>Outcome</th>
              <th className="r">Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="text-muted">
                  No orders in the {rangeWord}.
                </td>
              </tr>
            )}
            {rows.map((o) => {
              const amt = o.kind === "buy" ? o.usdIn : o.kind === "sell" ? o.usdOut : null;
              return (
                <tr key={o.id}>
                  <td className="whitespace-nowrap text-muted" title={stamp(o.createdAt)}>
                    {ago(o.createdAt)}
                  </td>
                  <td className="whitespace-nowrap">{o.wallet}</td>
                  <td className="whitespace-nowrap">
                    {o.slug ? (
                      <Link href={`/b/${o.slug}`} className="hover:underline">
                        {o.bag}
                      </Link>
                    ) : (
                      o.bag
                    )}
                  </td>
                  <td className="capitalize">{o.kind}</td>
                  <td>
                    <span className={stateBadge(o.state)} title={o.error ?? undefined}>
                      {o.state}
                    </span>
                  </td>
                  <td className={`r ${o.kind === "buy" && DONE.has(o.status) ? "text-gain" : ""}`}>{amt != null ? `${o.kind === "sell" ? "−" : "+"}${money(amt)}` : <span className="text-faint">—</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ---------- charts (hand-drawn SVG: one axis, thin marks, a tooltip on hover) ----------

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function niceStep(span: number, target: number, integer = false) {
  if (span <= 0) return 1;
  const raw = span / target;
  const p = 10 ** Math.floor(Math.log10(raw));
  const m = raw / p;
  const step = (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
  return integer ? Math.max(1, Math.round(step)) : step;
}

/** Bar with only its far end rounded, so it sits flat on the zero line. */
function barPath(x: number, w: number, y0: number, y1: number) {
  const h = Math.abs(y1 - y0);
  if (h < 0.5) return "";
  const r = Math.min(4, w / 2, h);
  const up = y1 < y0;
  const s = up ? 1 : -1;
  return `M${x},${y0} V${y1 + s * r} Q${x},${y1} ${x + r},${y1} H${x + w - r} Q${x + w},${y1} ${x + w},${y1 + s * r} V${y0} Z`;
}

const H = 260;
const M = { top: 14, right: 12, bottom: 28, left: 52 };

function xLabels(n: number, plotW: number) {
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(plotW / 72))));
  return (i: number) => i === n - 1 || (i % every === 0 && n - 1 - i >= every * 0.6);
}

function Tooltip({ x, width, children }: { x: number; width: number; children: React.ReactNode }) {
  // Beside the hovered day, never on top of it: to the left in the right half, to the right otherwise.
  const W = 176;
  const left = x > width / 2 ? Math.max(0, x - W - 16) : Math.min(width - W, x + 16);
  return (
    <div className="pointer-events-none absolute top-0 z-10 w-[176px] rounded-[10px] border border-[var(--border)] bg-[var(--elev)] px-3 py-2.5 text-[13px] shadow-[var(--shadow-md)]" style={{ left }}>
      {children}
    </div>
  );
}

function TipRow({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-2 text-muted">
        <span className="inline-block size-2 rounded-[2px]" style={{ background: color }} />
        {label}
      </span>
      <b className="font-medium tabular-nums">{value}</b>
    </div>
  );
}

function FlowChart({ days }: { days: Day[] }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const maxIn = Math.max(0, ...days.map((d) => d.in));
  const maxOut = Math.max(0, ...days.map((d) => d.out));
  const empty = maxIn === 0 && maxOut === 0;

  const plotW = Math.max(0, width - M.left - M.right);
  const plotH = H - M.top - M.bottom;
  const step = niceStep(maxIn + maxOut, 4);
  const top = Math.ceil(maxIn / step) * step;
  const bottom = Math.ceil(maxOut / step) * step;
  const span = top + bottom || 1;
  const y = (v: number) => M.top + ((top - v) / span) * plotH;
  const colW = plotW / Math.max(1, days.length);
  const barW = Math.max(2, Math.min(28, colW * 0.62));
  const showX = xLabels(days.length, plotW);
  const ticks: number[] = [];
  for (let v = -bottom; v <= top + 1e-9; v += step) ticks.push(v);

  const pick = (e: React.PointerEvent<SVGSVGElement>) => {
    const i = Math.floor((e.clientX - e.currentTarget.getBoundingClientRect().left - M.left) / colW);
    setHover(i >= 0 && i < days.length ? i : null);
  };
  const h = hover != null ? days[hover] : null;

  return (
    <div ref={ref} className="relative">
      {width > 0 && (
        <svg width={width} height={H} role="img" aria-label="Money in and out per day" onPointerMove={pick} onPointerLeave={() => setHover(null)} className="block touch-pan-y">
          {ticks.map((v) => (
            <g key={v}>
              <line x1={M.left} x2={width - M.right} y1={y(v)} y2={y(v)} stroke={v === 0 ? "var(--line-strong)" : "var(--line)"} strokeDasharray={v === 0 ? undefined : "2 4"} />
              <text x={M.left - 10} y={y(v)} dy="0.32em" textAnchor="end" fontSize={12} fill="var(--muted)" className="tabular-nums">
                {v === 0 ? "$0" : usd(Math.abs(v), { compact: true })}
              </text>
            </g>
          ))}
          {!empty && bottom > 0 && (
            <>
              <text x={M.left + 6} y={M.top + 2} dy="0.8em" fontSize={11} fill="var(--faint)">In</text>
              <text x={M.left + 6} y={H - M.bottom - 6} fontSize={11} fill="var(--faint)">Out</text>
            </>
          )}
          {hover != null && <rect x={M.left + hover * colW} y={M.top} width={colW} height={plotH} fill="var(--layer-2)" rx={4} />}
          {days.map((d, i) => {
            const x = M.left + i * colW + (colW - barW) / 2;
            return (
              <g key={d.key}>
                <path d={barPath(x, barW, y(0), y(d.in))} fill="var(--accent-fg)" />
                <path d={barPath(x, barW, y(0), y(-d.out))} fill="var(--muted)" />
                {showX(i) && (
                  <text x={M.left + i * colW + colW / 2} y={H - 8} textAnchor="middle" fontSize={12} fill="var(--muted)">
                    {dayLabel(d.key)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}
      {empty && width > 0 && <p className="fine absolute inset-x-0 top-[42%] text-center">No buys or sells in this range.</p>}
      {h && !empty && (
        <Tooltip x={M.left + (hover! + 0.5) * colW} width={width}>
          <div className="mb-1.5 font-medium">{dayLabel(h.key, true)}</div>
          <div className="grid gap-1">
            <TipRow color="var(--accent-fg)" label={count(h.buys, "buy")} value={money(h.in)} />
            <TipRow color="var(--muted)" label={count(h.sells, "sell")} value={money(h.out)} />
            <div className="mt-1 flex justify-between border-t border-[var(--line)] pt-1.5">
              <span className="text-muted">Net</span>
              <b className={`font-medium tabular-nums ${h.in - h.out > 0 ? "text-gain" : ""}`}>{money(h.in - h.out)}</b>
            </div>
          </div>
        </Tooltip>
      )}
    </div>
  );
}

function WalletChart({ days }: { days: Day[] }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const R = 92; // room on the right for the end labels
  const plotW = Math.max(0, width - M.left - R);
  const plotH = H - M.top - M.bottom;
  const max = Math.max(1, ...days.map((d) => d.signed));
  const step = niceStep(max, 4, true);
  const top = Math.ceil(max / step) * step;
  const y = (v: number) => M.top + (1 - v / top) * plotH;
  const colW = plotW / Math.max(1, days.length);
  const cx = (i: number) => M.left + (i + 0.5) * colW;
  const showX = xLabels(days.length, plotW);
  const ticks: number[] = [];
  for (let v = 0; v <= top; v += step) ticks.push(v);

  // Step lines: a count only changes on the day something happens.
  const path = (get: (d: Day) => number) =>
    days.map((d, i) => (i === 0 ? `M${M.left},${y(get(d))} H${cx(0)}` : `H${cx(i)} V${y(get(d))}`)).join(" ") + ` H${M.left + plotW}`;

  const last = days.at(-1);
  let ySigned = last ? y(last.signed) : 0;
  let yBought = last ? y(last.bought) : 0;
  if (Math.abs(ySigned - yBought) < 16) {
    const mid = (ySigned + yBought) / 2;
    ySigned = mid - 8;
    yBought = mid + 8;
  }

  const pick = (e: React.PointerEvent<SVGSVGElement>) => {
    const i = Math.floor((e.clientX - e.currentTarget.getBoundingClientRect().left - M.left) / colW);
    setHover(i >= 0 && i < days.length ? i : null);
  };
  const h = hover != null ? days[hover] : null;

  return (
    <div ref={ref} className="relative">
      {width > 0 && (
        <svg width={width} height={H} role="img" aria-label="Wallets that signed in and bought, over time" onPointerMove={pick} onPointerLeave={() => setHover(null)} className="block touch-pan-y">
          {ticks.map((v) => (
            <g key={v}>
              <line x1={M.left} x2={M.left + plotW} y1={y(v)} y2={y(v)} stroke={v === 0 ? "var(--line-strong)" : "var(--line)"} strokeDasharray={v === 0 ? undefined : "2 4"} />
              <text x={M.left - 10} y={y(v)} dy="0.32em" textAnchor="end" fontSize={12} fill="var(--muted)" className="tabular-nums">
                {v}
              </text>
            </g>
          ))}
          {days.map((d, i) =>
            showX(i) ? (
              <text key={d.key} x={cx(i)} y={H - 8} textAnchor="middle" fontSize={12} fill="var(--muted)">
                {dayLabel(d.key)}
              </text>
            ) : null,
          )}
          {hover != null && <line x1={cx(hover)} x2={cx(hover)} y1={M.top} y2={M.top + plotH} stroke="var(--faint)" strokeDasharray="3 3" />}
          <path d={path((d) => d.signed)} fill="none" stroke="var(--text)" strokeWidth={2} strokeLinejoin="round" />
          <path d={path((d) => d.bought)} fill="none" stroke="var(--accent-fg)" strokeWidth={2} strokeLinejoin="round" />
          {h && (
            <>
              <circle cx={cx(hover!)} cy={y(h.signed)} r={4.5} fill="var(--text)" stroke="var(--elev)" strokeWidth={2} />
              <circle cx={cx(hover!)} cy={y(h.bought)} r={4.5} fill="var(--accent-fg)" stroke="var(--elev)" strokeWidth={2} />
            </>
          )}
          {last && (
            <g fontSize={12}>
              <text x={M.left + plotW + 8} y={ySigned} dy="0.32em" fill="var(--text)" fontWeight={500}>
                {last.signed} signed in
              </text>
              <text x={M.left + plotW + 8} y={yBought} dy="0.32em" fill="var(--text)" fontWeight={500}>
                {last.bought} bought
              </text>
            </g>
          )}
        </svg>
      )}
      {h && (
        <Tooltip x={cx(hover!)} width={width}>
          <div className="mb-1.5 font-medium">{dayLabel(h.key, true)}</div>
          <div className="grid gap-1">
            <TipRow color="var(--text)" label="Signed in" value={String(h.signed)} />
            <TipRow color="var(--accent-fg)" label="Bought" value={String(h.bought)} />
            {h.newWallets > 0 && <div className="mt-1 border-t border-[var(--line)] pt-1.5 text-muted">{count(h.newWallets, "new wallet")} that day</div>}
          </div>
        </Tooltip>
      )}
    </div>
  );
}

function StatsSkeleton() {
  return (
    <Loading label="Loading stats" className="grid grid-cols-[minmax(0,1fr)] gap-8">
      <div className="flex gap-3">
        <Skeleton className="h-10 w-64 rounded-[var(--r-md)]" />
        <Skeleton className="h-10 w-72 rounded-[var(--r-md)]" />
      </div>
      <Skeleton className="h-[228px] w-full rounded-[var(--r-lg)]" />
      <div className="grid gap-6 xl:grid-cols-[3fr_2fr]">
        <Skeleton className="h-[340px] w-full rounded-[var(--r-lg)]" />
        <Skeleton className="h-[340px] w-full rounded-[var(--r-lg)]" />
      </div>
    </Loading>
  );
}
