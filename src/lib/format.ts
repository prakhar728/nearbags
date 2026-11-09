// Display formatting shared by server and client components.

export const pct = (x: number | null | undefined, digits = 1, sign = true) =>
  x == null || !Number.isFinite(x) ? "—" : `${sign && x >= 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(x * 100).toFixed(digits)}%`;

export const tone = (x: number | null | undefined) => (x == null || !Number.isFinite(x) ? "text-muted" : x > 0 ? "text-gain" : x < 0 ? "text-loss" : "text-muted");

export function usd(x: number | null | undefined, opts: { compact?: boolean; cents?: boolean } = {}) {
  if (x == null || !Number.isFinite(x)) return "—";
  const neg = x < 0 ? "−" : "";
  const a = Math.abs(x);
  if (opts.compact && a >= 1000) {
    const [v, s] = a >= 1e6 ? [a / 1e6, "M"] : [a / 1e3, "K"];
    return `${neg}$${v.toFixed(v >= 100 ? 0 : 1)}${s}`;
  }
  return `${neg}$${a.toLocaleString("en-US", { minimumFractionDigits: opts.cents ? 2 : 0, maximumFractionDigits: opts.cents ? 2 : 0 })}`;
}

export const feePct = (bps: number) => `${+(bps / 100).toFixed(2)}%`;

export function ago(iso: string, now = Date.now()) {
  const s = Math.max(0, (now - Date.parse(iso)) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 30 * 86_400) return `${Math.floor(s / 86_400)}d ago`;
  if (s < 365 * 86_400) return `${Math.floor(s / (30 * 86_400))}mo ago`;
  return `${Math.floor(s / (365 * 86_400))}y ago`;
}

export const shortAddr = (a: string) => (a.length > 18 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);

export const creatorName = (c: { handle: string | null; address: string }) => (c.handle ? `@${c.handle}` : shortAddr(c.address));
export const creatorHref = (c: { handle: string | null; address: string }) => `/c/${encodeURIComponent(c.handle ?? c.address)}`;
