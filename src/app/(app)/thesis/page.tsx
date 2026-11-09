// Thesis track (spec §15): every chart is built by `pnpm thesis` from raw Explorer API pages into
// data/thesis/thesis.json. This page only reads that file; with no file it says what each chart will show.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { cacheLife } from "next/cache";
import { Bars, WeeklyChart } from "@/components/thesis/ThesisCharts";
import { pct, usd, pctSig } from "@/lib/format";
import { ONDO_ASSETS, requestTemplate, type StreamKind } from "@/lib/thesis/explorer";
import type { ThesisData } from "@/lib/thesis/types";

export const metadata = { title: "Thesis · Stonkbag" };

const CLAIM = "People will buy US stocks through NEAR Intents, but only when an app packages it. The demand fades when the push stops.";

async function loadThesis(): Promise<ThesisData | null> {
  "use cache";
  cacheLife("max"); // the file only changes with a commit, which means a new build
  try {
    const d = JSON.parse(await readFile(path.join(process.cwd(), "data/thesis/thesis.json"), "utf8")) as ThesisData;
    return d?.version === 1 && Array.isArray(d.weekly) && d.weekly.length > 0 ? d : null;
  } catch {
    return null;
  }
}

const ONDO_LIST = ONDO_ASSETS.map((a) => `${a.id.padEnd(6)} ${a.intentsAssetId}`).join("\n");
const ondoRequest = `${requestTemplate("ondo-in")}\n\n${requestTemplate("ondo-out")}\n\nOndo ids:\n${ONDO_LIST}`;
const req = (kind: StreamKind) => requestTemplate(kind);

const RULES =
  "Counted: status SUCCESS only, deduplicated by deposit address + memo. USD = amountInUsd (amountOutUsd if zero). " +
  "Trader = refundTo, else first sender, else recipient. Weeks start Monday 00:00 UTC.";

interface ChartDef {
  id: string;
  title: string;
  pending: string; // what the chart will show, for the pending state
  request: string;
  rule: string;
}

const CHARTS: ChartDef[] = [
  { id: "volume", title: "Ondo swap volume per week", pending: "USD value of 1Click swaps into or out of Ondo stock and ETF tokens, per week.", request: ondoRequest, rule: `${RULES} Volume = sum of USD per week.` },
  { id: "traders", title: "Ondo swaps and unique traders per week", pending: "How many Ondo swaps happened each week, and how many distinct traders made them.", request: ondoRequest, rule: RULES },
  { id: "share", title: "Ondo share of all 1Click volume", pending: "Ondo USD volume divided by all 1Click USD volume, for each complete week.", request: req("all"), rule: `${RULES} Share = Ondo rows in this pull ÷ all rows in this pull, by USD. Only weeks that ended 2+ days ago and were pulled to the last page.` },
  { id: "days", title: "Weekday vs weekend", pending: "Ondo volume by day of week (UTC), to see how much trades while US exchanges are shut.", request: ondoRequest, rule: `${RULES} Day = UTC day of createdAtTimestamp.` },
  { id: "sizes", title: "Swap sizes", pending: "How many Ondo swaps fall in each USD size band.", request: ondoRequest, rule: `${RULES} Bands: < $100, $100–1K, $1K–10K, $10K–100K, ≥ $100K.` },
  { id: "apps", title: "Which app routed the swaps", pending: "Ondo swaps by the referral tag the routing app passes to 1Click.", request: ondoRequest, rule: `${RULES} App = the row's referral field; empty counts as (none).` },
  { id: "assets", title: "Top assets", pending: "Ondo volume per token. A stock-to-stock swap counts for both tokens.", request: ondoRequest, rule: RULES },
  {
    id: "tvl",
    title: "Stonkbag basket TVL",
    pending: "Value held in Stonkbag baskets, from chain, and its daily history.",
    request: 'NEAR RPC view call on intents.near, per basket position account:\n  mt_batch_balance_of { account_id, token_ids }\npriced at reference prices (src/lib/stats.ts); history from the daily snapshots table (/api/cron/snapshots).',
    rule: "TVL = sum over live and closed baskets of each position's token balances × reference price.",
  },
];

export default async function ThesisPage() {
  const d = await loadThesis();
  return (
    <article className="grid gap-10">
      <header className="grid max-w-3xl gap-3">
        <span className="font-mono text-[11px] uppercase tracking-wider text-faint">Thesis track</span>
        <h1 className="text-2xl font-semibold tracking-tight">{CLAIM}</h1>
        <p className="text-sm leading-relaxed text-muted">
          Each chart below comes from the NEAR Intents Explorer API and Stonkbag&apos;s own on-chain balances, rebuilt with{" "}
          <code className="font-mono text-text">pnpm thesis</code>. We started from &ldquo;tokenized US stocks are becoming a real use of NEAR Intents&rdquo;; the
          data below rejected that, so the claim changed. The full argument and the evidence against it are in THESIS.md in the repo.
        </p>
        {d ? (
          <p className="font-mono text-[11px] text-faint">
            Built {d.generatedAt.slice(0, 16).replace("T", " ")} UTC · {d.summary.data_since} to {d.summary.data_until} · {d.source.ondoAssetIds.length} Ondo tokens
          </p>
        ) : (
          <p className="border border-border-strong px-3 py-2 font-mono text-[11px] text-muted">
            Data pending: the Explorer API key is not set up yet, so nothing has been pulled. No numbers are shown until it is.
          </p>
        )}
      </header>
      {d ? <Charts d={d} /> : <Pending />}
    </article>
  );
}

function Card({ def, sentence, children }: { def: ChartDef; sentence: string; children?: React.ReactNode }) {
  return (
    <section className="grid gap-3 border-t border-border pt-6">
      <h2 className="font-mono text-[11px] uppercase tracking-wider text-muted">{def.title}</h2>
      <p className="max-w-3xl text-sm leading-relaxed text-text">{sentence}</p>
      {children}
      <details className="group">
        <summary className="cursor-pointer font-mono text-[11px] text-faint hover:text-muted">How this was made</summary>
        <div className="mt-2 grid gap-2">
          <pre className="overflow-x-auto border border-border bg-surface p-3 font-mono text-[11px] leading-relaxed text-muted">{def.request}</pre>
          <p className="font-mono text-[11px] leading-relaxed text-faint">{def.rule}</p>
        </div>
      </details>
    </section>
  );
}

function Pending() {
  return (
    <div className="grid gap-2">
      {CHARTS.map((c) => (
        <Card key={c.id} def={c} sentence={c.pending}>
          <div className="flex h-24 items-center justify-center border border-dashed border-border font-mono text-[11px] text-faint">data pending</div>
        </Card>
      ))}
    </div>
  );
}

const def = (id: string) => CHARTS.find((c) => c.id === id)!;

function Charts({ d }: { d: ThesisData }) {
  const s = d.summary;
  const times = d.weekly.map((w) => w.week);
  const shareRows = d.weekly.filter((w) => w.ondoShare != null);
  const change = s.ondo_volume_change_30d == null ? "" : `, ${pct(s.ondo_volume_change_30d)} vs the 30 days before`;
  const activeAssets = d.assets.filter((a) => a.swaps > 0);
  const tvlHistory = d.stonkbag?.history ?? [];

  return (
    <div className="grid gap-2">
      <Card def={def("volume")} sentence={`Ondo swaps moved ${usd(s.ondo_volume_30d)} in the last 30 days${change}.`}>
        <WeeklyChart times={times} series={[{ id: "vol", label: "Volume", format: "usd", data: d.weekly.map((w) => w.ondoVolumeUsd) }]} />
      </Card>

      <Card def={def("traders")} sentence={`${s.ondo_traders_30d.toLocaleString("en-US")} traders made ${s.ondo_swaps_30d.toLocaleString("en-US")} Ondo swaps in the last 30 days.`}>
        <WeeklyChart
          times={times}
          series={[
            { id: "swaps", label: "Swaps", format: "count", data: d.weekly.map((w) => w.ondoSwaps) },
            { id: "traders", label: "Traders", format: "count", data: d.weekly.map((w) => w.ondoTraders) },
          ]}
        />
      </Card>

      <Card
        def={def("share")}
        sentence={
          s.ondo_share_latest == null
            ? "No complete week of all-1Click data has been pulled yet."
            : `Ondo swaps were ${pctSig(s.ondo_share_latest)} of all 1Click volume in the week of ${s.ondo_share_latest_week}.`
        }
      >
        {shareRows.length > 0 && (
          <WeeklyChart times={shareRows.map((w) => w.week)} series={[{ id: "share", label: "Share", format: "pct", data: shareRows.map((w) => w.ondoShare) }]} />
        )}
      </Card>

      <Card
        def={def("days")}
        sentence={s.weekend_volume_share == null ? "No Ondo swaps in the window." : `${pct(s.weekend_volume_share, 1, false)} of Ondo volume was on Saturday or Sunday (UTC).`}
      >
        <Bars format="usd" rows={d.byDay.map((r) => ({ label: r.day, value: r.volumeUsd, note: `${r.swaps} swaps` }))} />
      </Card>

      <Card
        def={def("sizes")}
        sentence={s.median_swap_usd == null ? "No Ondo swaps in the window." : `The median Ondo swap was ${usd(s.median_swap_usd)}; ${pct(s.share_swaps_under_1k, 1, false)} were under $1,000.`}
      >
        <Bars format="count" rows={d.sizes.map((r) => ({ label: r.label, value: r.swaps, note: usd(r.volumeUsd, { compact: true }) }))} />
      </Card>

      <Card
        def={def("apps")}
        sentence={
          s.top_app == null
            ? "No app tags in the window."
            : `${s.top_app} routed ${pct(s.top_app_swap_share, 1, false)} of Ondo swaps and ${pct(s.top_app_volume_share, 1, false)} of the volume, from the week of ${s.top_app_first_week} to ${s.top_app_last_week}. The peak week (${s.peak_week}) was ${usd(s.peak_week_volume)}; the latest full week was ${usd(s.latest_full_week_volume)}.`
        }
      >
        <Bars format="count" rows={d.apps.slice(0, 8).map((a) => ({ label: a.app, value: a.swaps, note: usd(a.volumeUsd, { compact: true }) }))} />
      </Card>

      <Card
        def={def("assets")}
        sentence={s.top_asset == null ? "No Ondo swaps in the window." : `${s.top_asset} was ${pct(s.top_asset_volume_share, 1, false)} of Ondo volume; ${activeAssets.length} of ${d.assets.length} tokens traded at all.`}
      >
        <Bars format="usd" rows={activeAssets.slice(0, 12).map((a) => ({ label: a.symbol, value: a.volumeUsd, note: `${a.buys} in / ${a.sells} out` }))} />
      </Card>

      <Card
        def={def("tvl")}
        sentence={
          d.stonkbag
            ? `Stonkbag baskets held ${usd(d.stonkbag.tvlUsd)} across ${d.stonkbag.baskets} baskets and ${d.stonkbag.holders} holders when the data was built.`
            : (d.stonkbagNote ?? "Stonkbag TVL was not included in this build.")
        }
      >
        {tvlHistory.length > 1 && (
          <WeeklyChart pointLabel="day" times={tvlHistory.map((h) => h.date)} series={[{ id: "tvl", label: "TVL", format: "usd", data: tvlHistory.map((h) => h.tvlUsd) }]} />
        )}
      </Card>
    </div>
  );
}
