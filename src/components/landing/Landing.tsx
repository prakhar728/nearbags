"use client";
import Link from "next/link";
import { Suspense, use, useCallback, useState } from "react";
import { ConnectButton } from "@/components/ConnectButton";
import type { LandingData } from "@/lib/landing";
import { HeroChart } from "./HeroChart";
import { Pour } from "./Pour";
import { Line, Magnetic, Reveal, Scramble, ScrollStretch, SessionClock, Tilt } from "./bits";

const money = (v: number) => "$" + Math.round(v).toLocaleString("en-US");
const pct = (v: number, digits = 0) => `${v >= 0 ? "+" : "−"}${Math.abs(v * 100).toFixed(digits)}%`;

function Title() {
  const words = [
    { w: "BAG", acc: false },
    { w: "IT.", acc: true },
  ];
  let i = 0;
  return (
    <h1 className="lp-title" aria-label="Bag it.">
      {words.map(({ w, acc }) => (
        <span key={w} className="lp-word" aria-hidden>
          {w.split("").map((ch) => (
            <span key={ch + i} className={`lp-ch ${acc && ch === "." ? "lp-acc" : ""}`} style={{ "--i": i++ } as React.CSSProperties}>
              {ch}
            </span>
          ))}
        </span>
      ))}
    </h1>
  );
}

function Tape({ items, variant }: { items: LandingData["tape"]; variant: "a" | "b" }) {
  const list = variant === "a" ? items : [...items].reverse();
  const row = list.map((t) => (
    <span key={t.id} className="lp-tick">
      <b>{t.id}</b>
      <span className={t.ret >= 0 ? "lp-up" : "lp-down"}>{pct(t.ret)}</span>
      <small>{t.label}</small>
      <span aria-hidden>{variant === "a" ? "▲" : "◆"}</span>
    </span>
  ));
  return (
    <div className={`lp-tape lp-tape-${variant}`} aria-hidden>
      <div className="lp-track" style={{ "--dur": `${Math.max(40, items.length * 2.4)}s` } as React.CSSProperties}>
        {row}
        {row}
      </div>
    </div>
  );
}

function Spark({ values, i }: { values: number[]; i: number }) {
  const w = 300;
  const h = 70;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const d = values.map((v, k) => `${k ? "L" : "M"}${((k / (values.length - 1)) * w).toFixed(1)},${(h - 4 - ((v - min) / (max - min || 1)) * (h - 8)).toFixed(1)}`).join("");
  const up = values.at(-1)! >= values[0];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none" aria-hidden style={{ "--i": i } as React.CSSProperties}>
      <path d={d} pathLength={1} fill="none" stroke={up ? "var(--accent)" : "var(--loss)"} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

type Data = Promise<LandingData | null>;

// The shell (title, copy, sections) renders once; only the price-driven parts stream in.
// Swapping the whole page in after the data loads used to remount the title and replay its animation.
function ChartSlot({ data, onProgress }: { data: Data; onProgress: (v: number, done: boolean) => void }) {
  const hero = use(data)?.hero;
  return hero ? <HeroChart data={hero} onProgress={onProgress} /> : null;
}

function Caption({ data }: { data: Data }) {
  const hero = use(data)?.hero;
  if (!hero) return <>REAL PRICES · HISTORICAL, NOT A FORECAST</>;
  const end = hero.basket.at(-1) ?? null;
  return (
    <>
      {hero.name.toUpperCase()} · SINCE {hero.start.slice(0, 4)}
      {end ? ` · ${pct(end / 1000 - 1)}` : ""}
      <br />
      REAL PRICES · HISTORICAL, NOT A FORECAST · HOVER THE CHART
    </>
  );
}

function Tapes({ data }: { data: Data }) {
  const d = use(data);
  if (!d || d.tape.length === 0) return null;
  return (
    <div className="lp-tapes">
      <Tape items={d.tape} variant="b" />
      <Tape items={d.tape} variant="a" />
    </div>
  );
}

function Bags({ data }: { data: Data }) {
  const d = use(data);
  if (!d || d.bags.length === 0) return null;
  return (
        <section className="lp-sec lp-wrap">
          <Reveal>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", gap: 20, flexWrap: "wrap", marginBottom: 28 }}>
              <div>
                <span className="lp-label">04 / BAGS</span>
                <h2 className="lp-h2">
                  <Line i={0}>Fresh</Line>
                  <Line i={1}>
                    <em>bags.</em>
                  </Line>
                </h2>
              </div>
              <Link href="/explore" className="lp-btn lp-up-in">SEE ALL</Link>
            </div>
            <div className="lp-bags">
              {d.bags.map((b, i) => (
                <Tilt key={b.slug} href={`/b/${b.slug}`} className="lp-bag" style={{ "--i": i } as React.CSSProperties}>
                  <h3>{b.name}</h3>
                  <div className="lp-cap" style={{ textTransform: "none", letterSpacing: 0 }}>{b.tagline}</div>
                  <Spark values={b.spark} i={i} />
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span className="lp-big-num" style={{ fontSize: 30, color: b.value >= 0 ? "var(--accent)" : "var(--loss)" }}>
                      {pct(b.value)}
                    </span>
                    <span className="lp-cap">{b.isCagr ? `${b.label.toUpperCase()}` : "TOTAL"} · BACKTEST</span>
                  </div>
                  <div className="lp-chips">
                    {b.assets.map((a) => (
                      <span key={a}>{a}</span>
                    ))}
                  </div>
                  <div className="lp-cap">
                    MIN ${b.minBuy} · FEE {(b.feeBps / 100).toFixed(2)}%{b.house ? " · HOUSE" : ""}
                  </div>
                </Tilt>
              ))}
            </div>
          </Reveal>
        </section>
  );
}

export function Landing({ data }: { data: Data }) {
  const [counter, setCounter] = useState<{ v: number; done: boolean }>({ v: 1000, done: false });
  const onProgress = useCallback((v: number, done: boolean) => setCounter({ v, done }), []);

  return (
    <div className="lp">
      <header className="lp-head lp-wrap">
        <Link href="/" className="lp-logo">STONKBAG</Link>
        <nav className="lp-nav">
          <Link href="/explore" className="hidden sm:inline">EXPLORE</Link>
          <Link href="/create" className="hidden sm:inline">CREATE</Link>
          <ConnectButton />
        </nav>
      </header>

      {/* ---------- hero ---------- */}
      <section className="lp-hero lp-wrap">
        <div className="lp-grid" aria-hidden />
        <div className="lp-chart">
          <Suspense fallback={null}>
            <ChartSlot data={data} onProgress={onProgress} />
          </Suspense>
        </div>
        <div>
          <div className="lp-kicker lp-fade" style={{ "--d": "0.1s" } as React.CSSProperties}>
            <span className="lp-dot" aria-hidden />
            <SessionClock />
            <span>STOCKS + CRYPTO · ANY CHAIN · YOUR KEYS</span>
          </div>
          <Title />
          <p className="lp-sub lp-fade" style={{ "--d": "0.75s" } as React.CSSProperties}>
            One click buys a creator&apos;s whole basket of stocks and crypto.
          </p>
          <div className="lp-ctas lp-fade" style={{ "--d": "0.95s" } as React.CSSProperties}>
            <Link href="/explore" className="lp-btn lp-btn-solid">BROWSE BAGS</Link>
            <Link href="/create" className="lp-btn">MAKE ONE</Link>
          </div>
        </div>
        <div className="lp-readout lp-fade" style={{ "--d": "1.2s" } as React.CSSProperties}>
          <div className="lp-big-num" aria-live="off">
            $1,000<span className="lp-arrow">→</span>
            <span className={counter.done ? "lp-acc" : ""}>{money(counter.v)}</span>
          </div>
          <div className="lp-cap">
            <Suspense fallback="LOADING REAL PRICES…">
              <Caption data={data} />
            </Suspense>
          </div>
        </div>
      </section>

      {/* ---------- tapes ---------- */}
      <Suspense fallback={null}>
        <Tapes data={data} />
      </Suspense>

      {/* ---------- any chain in ---------- */}
      <section className="lp-sec lp-wrap">
        <div className="lp-sec-grid">
          <Reveal>
            <span className="lp-label">01 / PAY</span>
            <h2 className="lp-h2">
              <Line i={0}>Any chain</Line>
              <Line i={1}>
                <em>in.</em>
              </Line>
            </h2>
            <p className="lp-p lp-up-in">Pay with what you hold. It lands as the whole bag.</p>
          </Reveal>
          <Pour />
        </div>
      </section>

      {/* ---------- your keys ---------- */}
      <section className="lp-sec lp-wrap">
        <div className="lp-sec-grid">
          <Reveal>
            <span className="lp-label">02 / HOLD</span>
            <h2 className="lp-h2">
              <Line i={0}>Your</Line>
              <Line i={1}>
                <em>keys.</em>
              </Line>
            </h2>
            <p className="lp-p lp-up-in">Every bag gets its own on-chain account. Only you can move it.</p>
          </Reveal>
          <Reveal className="lp-keys-box">
            <span className="lp-label" style={{ marginBottom: 0 }}>BASKET ACCOUNT · NEAR INTENTS</span>
            <Scramble />
            <ul className="lp-facts">
              <li className="lp-up-in" style={{ "--i": 1 } as React.CSSProperties}>Key made in your browser.</li>
              <li className="lp-up-in" style={{ "--i": 2 } as React.CSSProperties}>Your wallet is the backup.</li>
              <li className="lp-up-in" style={{ "--i": 3 } as React.CSSProperties}>Withdraw the real tokens anytime.</li>
            </ul>
          </Reveal>
        </div>
      </section>

      {/* ---------- creators ---------- */}
      <section className="lp-sec lp-wrap" style={{ paddingBottom: 40 }}>
        <Reveal>
          <span className="lp-label">03 / CREATE</span>
          <h2 className="lp-h2">
            <Line i={0}>Pick it. Pitch it.</Line>
            <Line i={1}>
              <em>Get paid.</em>
            </Line>
          </h2>
          <p className="lp-p lp-up-in">Creators set a fee, paid on-chain on every buy.</p>
        </Reveal>
        <ScrollStretch className="lp-fee" >
          <span aria-label="Zero to one percent">
            0<em>–</em>1%
          </span>
        </ScrollStretch>
      </section>

      {/* ---------- bags ---------- */}
      <Suspense fallback={null}>
        <Bags data={data} />
      </Suspense>

      {/* ---------- final ---------- */}
      <section className="lp-final lp-wrap">
        <Magnetic href="/explore">BAG IT</Magnetic>
        <div className="lp-cap">BUILT ON NEAR INTENTS · STOCKS BY ONDO · NOT FINANCIAL ADVICE · NO US PERSONS</div>
      </section>

      <footer className="lp-foot lp-wrap">
        <span>STONKBAG · NEAR HACKATHON 2026</span>
        <span style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
          <Link href="/explore">EXPLORE</Link>
          <Link href="/create">CREATE</Link>
          <a href="https://github.com/prakhar728/stonkbag" target="_blank" rel="noopener">GITHUB</a>
          <Link href="/terms">TERMS</Link>
          <Link href="/risk">RISKS</Link>
        </span>
      </footer>
    </div>
  );
}
