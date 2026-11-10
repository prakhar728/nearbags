// A shared P&L snapshot: what the owner chose to share, frozen when they shared it, with a way in for whoever opens it.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { readSnapshot } from "@/lib/share/token";

export const instant = false;

const SITE = process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");
const pctText = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(1)}%`;
const usdText = (x: number) => `${x >= 0 ? "+" : "−"}$${Math.abs(x).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const s = await readSnapshot(token);
  if (!s) return { title: "Not found · nearbags" };
  const title = `${pctText(s.pct)} on ${s.name} · nearbags`;
  const description = `${s.by ?? "Someone"} ${s.state === "open" ? "is holding" : "held"} the ${s.name} bag (${s.assets.join(", ")}). Buy the whole basket in one go, from any token on any chain.`;
  const image = { url: `${SITE}/api/og/pnl/${token}`, width: 1200, height: 630, alt: title };
  return { title, description, openGraph: { title, description, images: [image], type: "website" }, twitter: { card: "summary_large_image", title, description, images: [image.url] } };
}

export default async function SharedPnl({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const s = await readSnapshot(token);
  if (!s) notFound();
  const up = s.pct >= 0;
  const tone = up ? "text-gain" : "text-loss";

  return (
    <div className="mx-auto grid max-w-3xl gap-8 py-6">
      <div className="card card-ticks rise relative overflow-hidden p-8 sm:p-12">
        <div aria-hidden className="green-fade pointer-events-none absolute inset-x-0 bottom-0 h-40 opacity-60" />
        <div className="relative grid gap-3">
          <span className="label">
            {s.by ?? "A nearbags holder"} · {s.state === "open" ? "holding" : "closed"}
          </span>
          <h1 className="display text-[clamp(36px,6vw,64px)]">{s.name}</h1>
          <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
            <span className={`big-num text-6xl sm:text-8xl ${tone}`}>{pctText(s.pct)}</span>
            {s.usd != null && <span className={`num text-2xl ${tone}`}>{usdText(s.usd)}</span>}
          </div>
          <p className="num text-sm text-muted">
            {s.state === "open" ? `Day ${Math.max(1, s.days)} of holding` : `Closed after ${s.days} day${s.days === 1 ? "" : "s"}`} · shared{" "}
            {new Date(s.at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {s.assets.map((a) => (
              <span key={a} className="chip">
                {a}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-md text-sm leading-relaxed text-muted">
          nearbags baskets mix tokenized US stocks and crypto. Pay with any token on any chain and get the whole bag in one buy, in an account only your keys control.
        </p>
        <Link href={`/b/${s.slug}`} className="btn btn-primary">
          See the {s.name} bag →
        </Link>
      </div>
      <p className="num text-[11px] text-faint">A snapshot from when it was shared, not live. Past returns don&apos;t predict future ones. Not financial advice.</p>
    </div>
  );
}
