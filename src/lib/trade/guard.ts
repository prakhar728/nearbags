// Price guard (spec §7.4) and US market sessions. Pure functions.
//
// Thresholds: 1.5% warn / 5% block while US markets have a session (pre, regular, post).
// Overnight and weekends Ondo quotes come from thinner liquidity and drift from the next open (Ondo docs, Off-Hours),
// so the stock thresholds widen to 3% / 8%. Crypto always uses 1.5% / 5%.

export type Session = "pre" | "regular" | "post" | "overnight" | "weekend";

/** US equity session at a moment, in New York time. Holidays are not modelled (they read as a normal weekday). */
export function usSession(at: Date = new Date()): Session {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", hour: "numeric", minute: "numeric", hour12: false }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const wd = get("weekday");
  const mins = (Number(get("hour")) % 24) * 60 + Number(get("minute"));
  // Ondo's 24/5 week runs Sunday 20:00 ET to Friday 20:00 ET.
  if (wd === "Sat") return "weekend";
  if (wd === "Sun") return mins >= 20 * 60 ? "overnight" : "weekend";
  if (wd === "Fri" && mins >= 20 * 60) return "weekend";
  if (mins >= 4 * 60 && mins < 9 * 60 + 30) return "pre";
  if (mins >= 9 * 60 + 30 && mins < 16 * 60) return "regular";
  if (mins >= 16 * 60 && mins < 20 * 60) return "post";
  return "overnight";
}

export interface GuardResult {
  verdict: "ok" | "warn" | "block";
  deviation: number; // signed: + means we pay more than reference (buy) or receive less (sell)
  impliedPrice: number;
  referencePrice: number;
  thresholds: { warn: number; block: number };
  session: Session;
}

export function thresholdsFor(kind: "stock" | "etf" | "crypto" | "stable", session: Session) {
  if ((kind === "stock" || kind === "etf") && (session === "overnight" || session === "weekend")) return { warn: 0.03, block: 0.08 };
  return { warn: 0.015, block: 0.05 };
}

/**
 * side "buy": we spend `usd` and get `units` → implied = usd / units; bad when implied > reference.
 * side "sell": we give `units` and get `usd` → implied = usd / units; bad when implied < reference.
 */
export function guard(params: {
  side: "buy" | "sell";
  usd: number;
  units: number;
  referencePrice: number;
  kind: "stock" | "etf" | "crypto" | "stable";
  session: Session;
}): GuardResult {
  const { side, usd, units, referencePrice, kind, session } = params;
  const impliedPrice = usd / units;
  const raw = impliedPrice / referencePrice - 1;
  const deviation = side === "buy" ? raw : -raw;
  const thresholds = thresholdsFor(kind, session);
  const verdict = deviation > thresholds.block ? "block" : deviation > thresholds.warn ? "warn" : "ok";
  return { verdict, deviation, impliedPrice, referencePrice, thresholds, session };
}
