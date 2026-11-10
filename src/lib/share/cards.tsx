// Share images (1200×630, next/og). Satori rules: every element with more than one child is display:flex, inline
// styles only. Colours match the app: near-black, the landing's yellow, green/red for gains/losses.
import "server-only";
import { IconArt } from "@/lib/pwa/icon";
import type { PnlSnapshot } from "./token";

export const SIZE = { width: 1200, height: 630 };
const BG = "#171717";
const SURFACE = "#1f1f1f";
const LINE = "#2e2e2e";
const TEXT = "#f2f2f2";
const MUTED = "#8a8a8a";
const ACCENT = "#00ec97";
const GAIN = "#00ec97";
const LOSS = "#ff4d7d";
// The address printed on cards (text only, never a link). Set NEXT_PUBLIC_SITE_URL=https://nearbags.com once the
// domain is live; until then Vercel's production URL, then the brand name as plain text.
const HOST = (
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "https://nearbags.com")
).replace(/^https?:\/\//, "");

const pctText = (x: number, digits = 1) => `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(digits)}%`;
const usdText = (x: number) => `${x >= 0 ? "+" : "−"}$${Math.abs(x).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        background: BG,
        backgroundImage: `radial-gradient(circle at 85% 0%, rgba(0,236,151,0.14), transparent 55%), radial-gradient(circle at 0% 100%, rgba(0,236,151,0.05), transparent 50%)`,
        padding: 40,
        fontFamily: "JetBrains Mono",
        color: TEXT,
      }}
    >
      <div style={{ flex: 1, display: "flex", flexDirection: "column", border: `1px solid ${LINE}`, borderRadius: 32, background: "rgba(20,20,20,0.72)", padding: "44px 52px" }}>
        {children}
      </div>
    </div>
  );
}

function Header({ right }: { right: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 22, letterSpacing: 6, color: MUTED }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ display: "flex", borderRadius: 10, boxShadow: `0 0 0 1px ${LINE}` }}>
          <IconArt size={44} rounded />
        </div>
        <span style={{ color: TEXT, fontFamily: "Familjen Grotesk", fontWeight: 700, fontSize: 34, letterSpacing: -1.36 }}>nearbags</span>
      </div>
      <span style={{ letterSpacing: 2 }}>{right}</span>
    </div>
  );
}

function Pills({ items }: { items: string[] }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
      {items.slice(0, 8).map((t) => (
        <div key={t} style={{ display: "flex", padding: "8px 18px", borderRadius: 999, border: `1px solid ${LINE}`, background: SURFACE, fontSize: 22, color: TEXT }}>
          {t}
        </div>
      ))}
    </div>
  );
}

function Spark({ values, width, height }: { values: number[]; width: number; height: number }) {
  if (values.length < 2) return null;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * width, height - 8 - ((v - lo) / span) * (height - 16)] as const);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${d} L${width},${height} L0,${height} Z`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={ACCENT} stopOpacity="0.28" />
          <stop offset="100%" stopColor={ACCENT} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#g)" />
      <path d={d} fill="none" stroke={ACCENT} strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export interface BasketCardData {
  name: string;
  tagline: string;
  by: string | null;
  assets: { id: string; weightBps: number }[];
  spark: number[];
  stat: { value: number; label: string } | null;
}

export function BasketCard({ b }: { b: BasketCardData }) {
  return (
    <Frame>
      <Header right={b.by ? `by ${b.by}` : "creator basket"} />
      <div style={{ display: "flex", flex: 1, marginTop: 36, gap: 40 }}>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 20 }}>
          <div style={{ fontFamily: "Familjen Grotesk", fontSize: 80, lineHeight: 1.0, letterSpacing: -3 }}>{b.name}</div>
          <div style={{ fontSize: 26, color: MUTED, lineHeight: 1.35 }}>{b.tagline}</div>
          <div style={{ display: "flex", marginTop: 8 }}>
            <Pills items={b.assets.map((a) => `${a.id} ${Math.round(a.weightBps / 100)}%`)} />
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", width: 380, justifyContent: "flex-end", gap: 12 }}>
          {b.stat && (
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 20, color: MUTED, letterSpacing: 2 }}>{b.stat.label.toUpperCase()}</span>
              <span style={{ fontSize: 64, fontWeight: 800, color: b.stat.value >= 0 ? GAIN : LOSS }}>{pctText(b.stat.value, 0)}</span>
            </div>
          )}
          <Spark values={b.spark} width={380} height={150} />
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 28, fontSize: 22, color: MUTED }}>
        <span>Any token, any chain. One buy, the whole bag.</span>
        <div style={{ display: "flex", flexShrink: 0, whiteSpace: "nowrap", padding: "12px 24px", borderRadius: 999, background: ACCENT, color: "#0a0a0a", fontWeight: 800 }}>{HOST}</div>
      </div>
    </Frame>
  );
}

export function PnlCard({ s }: { s: PnlSnapshot }) {
  const up = s.pct >= 0;
  const held = s.state === "open" ? `holding · day ${Math.max(1, s.days)}` : `closed after ${s.days} day${s.days === 1 ? "" : "s"}`;
  return (
    <Frame>
      <Header right={s.by ? s.by : "my bag"} />
      <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center", gap: 6 }}>
        <span style={{ fontSize: 24, color: MUTED, letterSpacing: 3 }}>{`MY ${s.name.toUpperCase()} BAG`}</span>
        <div style={{ display: "flex", alignItems: "baseline", gap: 28 }}>
          <span style={{ fontSize: 168, fontWeight: 800, letterSpacing: -6, color: up ? GAIN : LOSS, lineHeight: 1 }}>{pctText(s.pct)}</span>
          {s.usd != null && <span style={{ fontSize: 48, color: up ? GAIN : LOSS }}>{usdText(s.usd)}</span>}
        </div>
        <span style={{ fontSize: 26, color: MUTED, marginTop: 6 }}>{held}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 24 }}>
        <Pills items={s.assets} />
        <div style={{ display: "flex", flexShrink: 0, whiteSpace: "nowrap", padding: "12px 24px", borderRadius: 999, background: ACCENT, color: "#0a0a0a", fontWeight: 800, fontSize: 22 }}>{HOST}</div>
      </div>
    </Frame>
  );
}
