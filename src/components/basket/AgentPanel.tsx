"use client";
// Agent-managed baskets: the limits the agent works inside, its recent decisions with their OutLayer proofs, and a
// "Run now" button for the creator. The creator's strategy is never shown here.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/client/auth";

interface Run {
  id: number;
  at: string;
  trigger: "cron" | "creator" | "admin";
  status: "deciding" | "rebalancing" | "done" | "failed";
  before: Record<string, number> | null;
  after: Record<string, number> | null;
  reason: string | null;
  model: string | null;
  decideProof: string | null;
  swapProofs: string[];
  holders: number;
  skipped: string[];
  error: string | null;
}

interface Props {
  basketId: number;
  creatorId: number;
  limits: { minWeightBps: number; maxWeightBps: number; maxChangeBps: number; maxTurnoverBps: number };
}

const pct = (bps: number) => `${(bps / 100).toFixed(bps % 100 ? 1 : 0)}%`;
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
const STATUS: Record<Run["status"], string> = { deciding: "Deciding…", rebalancing: "Rebalancing holders…", done: "Done", failed: "Failed" };

export function AgentPanel({ basketId, creatorId, limits }: Props) {
  const { user } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const runs = useQuery({
    queryKey: ["agent-runs", basketId],
    queryFn: () => fetch(`/api/agent/runs?basketId=${basketId}`).then((r) => r.json() as Promise<{ runs: Run[] }>).then((j) => j.runs ?? []),
    refetchInterval: (q) => ((q.state.data ?? []).some((r) => r.status === "deciding" || r.status === "rebalancing") ? 8_000 : 60_000),
  });
  const isCreator = user?.id === creatorId;

  async function runNow() {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/agent/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ basketId }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? `The agent couldn't run (${r.status}).`);
      await qc.invalidateQueries({ queryKey: ["agent-runs", basketId] });
      router.refresh(); // the basket's weights changed
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const list = runs.data ?? [];
  return (
    <section className="card scroll-mt-24 space-y-5 p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="label">AI agent</p>
          <h2 className="mt-1 font-sans text-lg font-semibold text-text">This basket rebalances itself</h2>
          <p className="mt-1 max-w-[62ch] text-sm leading-relaxed text-muted">
            Once a day an agent reads the market and the creator&rsquo;s private strategy, picks new weights, and rebalances every holder who
            opted in. It runs in sealed hardware on OutLayer. Its key can only swap between this basket&rsquo;s assets inside each holder&rsquo;s
            own account; it cannot send funds anywhere else.
          </p>
        </div>
        {isCreator && (
          <button type="button" onClick={runNow} disabled={busy} className="btn btn-secondary btn-sm shrink-0">
            {busy ? "RUNNING…" : "RUN NOW"}
          </button>
        )}
      </div>
      {err && <p className="text-sm text-loss">{err}</p>}

      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        {[
          ["Each asset", `${pct(limits.minWeightBps)}–${pct(limits.maxWeightBps)}`],
          ["Max move per run", `${pct(limits.maxChangeBps)} pts`],
          ["Max traded per run", pct(limits.maxTurnoverBps)],
          ["Max per swap", "$100"],
        ].map(([k, v]) => (
          <div key={k} className="rounded-[var(--r-sm)] border border-[var(--line)] px-3 py-2">
            <dt className="label">{k}</dt>
            <dd className="num mt-1 text-text">{v}</dd>
          </div>
        ))}
      </dl>

      <div>
        <p className="label mb-2">Decisions</p>
        {runs.isLoading ? (
          <p className="text-sm text-faint">Loading…</p>
        ) : !list.length ? (
          <p className="text-sm text-muted">No runs yet. The first one happens at the next daily run{isCreator ? ", or press Run now" : ""}.</p>
        ) : (
          <ol className="grid gap-3">
            {list.map((r) => (
              <li key={r.id} className="rounded-[var(--r-sm)] border border-[var(--line)] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="num text-faint">
                    {when(r.at)} · {r.trigger === "cron" ? "daily run" : r.trigger === "creator" ? "run by creator" : "run by admin"}
                  </span>
                  <span className={`num ${r.status === "failed" ? "text-loss" : r.status === "done" ? "text-gain" : "text-accent"}`}>{STATUS[r.status]}</span>
                </div>
                {r.reason && <p className="mt-2 text-sm text-text">{r.reason}</p>}
                {r.error && <p className="mt-2 text-sm text-loss">{r.error}</p>}
                {r.before && r.after && <WeightChanges before={r.before} after={r.after} />}
                {r.status === "done" && r.holders === 0 && r.skipped.length > 0 && (
                  <p className="mt-2 text-xs text-muted">No swaps this run: {r.skipped.join(" ").replace(/\.$/, "")}.</p>
                )}
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                  {r.holders > 0 && <span>{r.holders} holder{r.holders === 1 ? "" : "s"} rebalanced</span>}
                  {r.decideProof && (
                    <a href={r.decideProof} target="_blank" rel="noopener noreferrer" className="underline decoration-[var(--accent-line)] underline-offset-2 hover:text-text">
                      Decision proof
                    </a>
                  )}
                  {r.swapProofs.length > 0 && (
                    <a href={r.swapProofs[r.swapProofs.length - 1]} target="_blank" rel="noopener noreferrer" className="underline decoration-[var(--accent-line)] underline-offset-2 hover:text-text">
                      Swap signing proof{r.swapProofs.length > 1 ? ` (latest of ${r.swapProofs.length})` : ""}
                    </a>
                  )}
                  {r.model && r.model !== "none" && <span className="num">model {r.model}</span>}
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

function WeightChanges({ before, after }: { before: Record<string, number>; after: Record<string, number> }) {
  const ids = Object.keys(after);
  const moved = ids.filter((id) => (before[id] ?? 0) !== after[id]);
  if (!moved.length) return <p className="mt-2 text-xs text-faint">Weights unchanged.</p>;
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {moved.map((id) => {
        const d = after[id] - (before[id] ?? 0);
        return (
          <span key={id} className="chip num">
            <span className="text-text">{id}</span> {pct(before[id] ?? 0)} → {pct(after[id])}{" "}
            <span className={d > 0 ? "text-gain" : "text-loss"}>
              {d > 0 ? "+" : ""}
              {(d / 100).toFixed(1)}
            </span>
          </span>
        );
      })}
    </div>
  );
}
