"use client";
import Link from "next/link";
import { Suspense, use, useCallback, useState } from "react";
import { AssetLogo } from "@/components/AssetLogo";
import { ConnectButton } from "@/components/ConnectButton";
import { Logo } from "@/components/Logo";
import type { LandingData } from "@/lib/landing";
import { assetColor, CHART } from "@/lib/palette";
import { HeroChart } from "./HeroChart";
import { Pour } from "./Pour";
import { Reveal, Scramble, SessionClock } from "./bits";

const money = (v: number) => "$" + Math.round(v).toLocaleString("en-US");
const pct = (v: number, digits = 0) => `${v >= 0 ? "+" : "−"}${Math.abs(v * 100).toFixed(digits)}%`;

type Data = Promise<LandingData | null>;

// The shell (title, copy, sections) renders once; only the price-driven parts stream in.
function ChartSlot({ data, onProgress }: { data: Data; onProgress: (v: number, done: boolean) => void }) {
  const hero = use(data)?.hero;
  return hero ? <HeroChart data={hero} onProgress={onProgress} /> : null;
}

function ChartTitle({ data }: { data: Data }) {
  const hero = use(data)?.hero;
  if (!hero) return <>$1,000 in a basket · real prices</>;
  return (
    <>
      $1,000 in {hero.name} on {hero.start.slice(0, 7)}
    </>
  );
}

/** Legend under the hero chart: each asset's logo, its line colour and its own return over the same years. */
function Legend({ data }: { data: Data }) {
  const hero = use(data)?.hero;
  if (!hero) return null;
  return (
    <div className="lp-legend">
      {hero.assets.map((a, k) => {
        const ret = a.values.at(-1)! / a.values[0] - 1;
        return (
          <span key={a.id} className="chip gap-1.5 pl-1.5 text-text">
            <AssetLogo id={a.id} size={20} />
            {a.id}
            <span className="inline-block h-[3px] w-3 rounded-full" style={{ background: assetColor(k) }} aria-hidden />
            <span className={ret >= 0 ? "text-gain" : "text-loss"}>{pct(ret)}</span>
          </span>
        );
      })}
      <span className="chip gap-1.5 text-text">
        <span className="inline-block h-[3px] w-4 rounded-full" style={{ background: CHART.basket }} aria-hidden />
        Basket
      </span>
    </div>
  );
}

function Tape({ data }: { data: Data }) {
  const d = use(data);
  if (!d || d.tape.length === 0) return null;
  const row = d.tape.map((t) => (
    <span key={t.id} className="lp-tick">
      <AssetLogo id={t.id} size={28} />
      <b>{t.id}</b>
      <span className={`num ${t.ret >= 0 ? "text-gain" : "text-loss"}`}>{pct(t.ret)}</span>
      <small>{t.label}</small>
    </span>
  ));
  return (
    <div className="lp-tape" aria-label="Five-year returns of the assets you can bag">
      <div className="lp-track" style={{ "--dur": `${Math.max(40, d.tape.length * 3)}s` } as React.CSSProperties}>
        {row}
        <span aria-hidden className="contents">
          {row}
        </span>
      </div>
    </div>
  );
}

function Spark({ values }: { values: number[] }) {
  const w = 300;
  const h = 64;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const d = values.map((v, k) => `${k ? "L" : "M"}${((k / (values.length - 1)) * w).toFixed(1)},${(h - 4 - ((v - min) / (max - min || 1)) * (h - 8)).toFixed(1)}`).join("");
  const up = values.at(-1)! >= values[0];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none" aria-hidden>
      <path d={d} pathLength={1} fill="none" stroke={up ? "var(--accent)" : "var(--loss)"} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Bags({ data }: { data: Data }) {
  const d = use(data);
  if (!d || d.bags.length === 0) return null;
  return (
    <div className="lp-bags">
      {d.bags.slice(0, 6).map((b) => (
        <Link key={b.slug} href={`/b/${b.slug}`} className="lp-bag">
          <div className="lp-logos" aria-hidden>
            {b.assets.slice(0, 5).map((a) => (
              <AssetLogo key={a} id={a} size={32} />
            ))}
            {b.assets.length > 5 && <span>+{b.assets.length - 5}</span>}
          </div>
          <div className="grid gap-1.5">
            <h3>{b.name}</h3>
            <p>{b.tagline}</p>
          </div>
          <Spark values={b.spark} />
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className={`lp-bag-num ${b.value >= 0 ? "text-gain" : "text-loss"}`}>{pct(b.value)}</div>
              <div className="lp-cap">{b.isCagr ? `${b.label} backtest` : "Total backtest"}</div>
            </div>
            <div className="lp-cap text-right">
              Min ${b.minBuy} · fee {(b.feeBps / 100).toFixed(2)}%{b.house ? " · house" : ""}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

function Stats({ data }: { data: Data }) {
  const d = use(data);
  const items: [string, string][] = [
    ["0–1%", "creator fee, paid on-chain"],
    [d ? String(d.tape.length) : "—", "stocks and coins to bag"],
    [d ? String(d.bags.length) : "—", "live bags right now"],
  ];
  return (
    <div className="lp-stats">
      {items.map(([v, k]) => (
        <div key={k}>
          <span className="num">{v}</span>
          <span>{k}</span>
        </div>
      ))}
    </div>
  );
}

const STEPS = [
  {
    title: "Any chain in.",
    body: "Pay with what you hold. It lands as the whole bag.",
  },
  {
    title: "Your keys.",
    body: "Every bag gets its own on-chain account. Only you can move it.",
  },
  {
    title: "Pick it. Pitch it. Get paid.",
    body: "Creators set a fee, paid on-chain on every buy.",
  },
] as const;

function Stage({ step }: { step: number }) {
  if (step === 0) return <Pour />;
  if (step === 1)
    return (
      <div className="lp-widget lp-keys">
        <span className="lp-cap">Basket account · NEAR Intents</span>
        <Scramble />
        <ul className="lp-facts">
          <li>Key made in your browser.</li>
          <li>Your wallet is the backup.</li>
          <li>Withdraw the real tokens anytime.</li>
        </ul>
      </div>
    );
  return (
    <div className="lp-widget lp-fee">
      <span className="lp-cap">Creator fee</span>
      <span className="lp-fee-num" aria-label="Zero to one percent">
        0–1%
      </span>
      <span className="lp-cap">Paid on-chain on every buy. Selling is free.</span>
    </div>
  );
}

function HowItWorks() {
  const [step, setStep] = useState(0);
  return (
    <div className="lp-split">
      <div className="lp-rows" role="tablist" aria-label="How a bag works">
        {STEPS.map((s, i) => (
          <button key={s.title} type="button" role="tab" aria-selected={i === step} aria-controls="lp-stage" className="lp-row" onClick={() => setStep(i)}>
            <span className="lp-row-title">{s.title}</span>
            <span className="lp-row-body">{s.body}</span>
          </button>
        ))}
      </div>
      <div id="lp-stage" role="tabpanel" className="lp-stage green-band">
        <Stage step={step} />
      </div>
    </div>
  );
}

export function Landing({ data }: { data: Data }) {
  const [counter, setCounter] = useState<{ v: number; done: boolean }>({ v: 1000, done: false });
  const onProgress = useCallback((v: number, done: boolean) => setCounter({ v, done }), []);

  return (
    <div className="lp">
      <header className="lp-head">
        <div className="lp-frame lp-head-in">
          <Logo href="/" />
          <nav className="lp-nav">
            <Link href="/explore" className="hidden sm:inline-flex">Explore</Link>
            <Link href="/create" className="hidden sm:inline-flex">Create</Link>
            <Link href="/docs" className="hidden md:inline-flex">Docs</Link>
            <ConnectButton />
          </nav>
        </div>
      </header>

      {/* ---------- hero: copy on the left, the braiding chart on the right ---------- */}
      <section className="lp-frame lp-hero">
        <div className="lp-hero-copy">
          <h1 className="lp-h1">
            Bag it. Any chain. <span className="text-muted">Your keys.</span>
          </h1>
          <p className="lp-lead">One click buys a creator&apos;s whole basket of stocks and crypto.</p>
          <div className="lp-ctas">
            <Link href="/explore" className="btn btn-primary btn-lg">Browse bags</Link>
            <Link href="/create" className="btn btn-secondary btn-lg">Make one</Link>
          </div>
          <p className="lp-note">Stocks + crypto · any chain · your keys</p>
          <p className="lp-live">
            <span className="live-dot" aria-hidden />
            <SessionClock />
          </p>
        </div>
        <div className="lp-hero-chart">
          <div className="lp-readout">
            <div className="label">
              <Suspense fallback="$1,000 in a basket · real prices">
                <ChartTitle data={data} />
              </Suspense>
            </div>
            <div className="lp-readout-num num" aria-live="off">
              $1,000 <span className="text-faint">→</span> <span className={counter.done ? "text-gain" : ""}>{money(counter.v)}</span>
            </div>
          </div>
          <div className="lp-chart">
            <Suspense fallback={null}>
              <ChartSlot data={data} onProgress={onProgress} />
            </Suspense>
          </div>
          <Suspense fallback={null}>
            <Legend data={data} />
          </Suspense>
          <p className="lp-cap">Real prices, dividends reinvested. Historical, not a forecast. Hover the chart.</p>
        </div>
      </section>

      {/* ---------- asset tape ---------- */}
      <Suspense fallback={null}>
        <Tape data={data} />
      </Suspense>

      {/* ---------- how it works ---------- */}
      <section className="lp-frame lp-sec">
        <Reveal className="lp-sec-head">
          <h2 className="lp-h2">One click. The whole bag.</h2>
          <p className="lp-sub">Pay from any chain, keep the keys, and the creator gets paid on every buy.</p>
        </Reveal>
        <HowItWorks />
      </section>
      <div className="lp-frame plus-band" aria-hidden />

      {/* ---------- bags ---------- */}
      <section className="lp-dark theme-dark">
        <div className="lp-frame lp-sec">
          <Reveal className="lp-sec-head lp-sec-head-row">
            <div>
              <h2 className="lp-h2">Fresh bags.</h2>
              <p className="lp-sub">Live baskets from creators, with their backtest. Historical, not a forecast.</p>
            </div>
            <Link href="/explore" className="btn btn-primary">See all bags</Link>
          </Reveal>
          <Suspense fallback={null}>
            <Bags data={data} />
          </Suspense>
          <Suspense fallback={null}>
            <Stats data={data} />
          </Suspense>
        </div>
        <div className="lp-frame plus-band" aria-hidden />
      </section>

      {/* ---------- final ---------- */}
      <section className="green-band">
        <div className="lp-frame lp-final">
          <h2 className="lp-h2">Bag it.</h2>
          <p className="lp-final-p">Built on NEAR Intents. Stocks by Ondo. Not financial advice. Not for US persons.</p>
          <Link href="/explore" className="btn btn-lg lp-final-btn">Browse bags</Link>
        </div>
      </section>

      <footer className="lp-foot theme-dark">
        <div className="lp-frame lp-foot-in">
          <div className="lp-foot-brand">
            <Logo href="/" />
            <p>Creator-made baskets of tokenized stocks and crypto. Buy the whole bag from any chain, keep your own keys.</p>
          </div>
          <div className="lp-foot-cols">
            <div>
              <h3>Product</h3>
              <Link href="/explore">Explore</Link>
              <Link href="/create">Create</Link>
              <Link href="/portfolio">Portfolio</Link>
            </div>
            <div>
              <h3>Learn</h3>
              <Link href="/docs">Docs</Link>
              <Link href="/thesis">Thesis</Link>
              <a href="https://github.com/prakhar728/stonkbag" target="_blank" rel="noopener">GitHub</a>
            </div>
            <div>
              <h3>Legal</h3>
              <Link href="/terms">Terms</Link>
              <Link href="/risk">Risks</Link>
            </div>
          </div>
        </div>
        <div className="lp-frame lp-foot-note">Stonkbag · NEAR hackathon 2026</div>
        <div className="lp-frame lp-watermark" aria-hidden>
          STONKBAG
        </div>
      </footer>
    </div>
  );
}
