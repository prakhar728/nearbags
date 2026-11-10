// Rule-based strategies a creator can pick instead of writing one for the AI. The maths runs in the strategist
// (agent/strategist/src/templates.rs) inside OutLayer, so every decision still has a proof. Shared by the create
// page, the basket page and the server.

export type TemplateId = "fixed" | "equal" | "risk" | "trend" | "voltarget" | "momentum";

export interface Template {
  id: TemplateId;
  name: string;
  /** One line for the picker. */
  short: string;
  /** How it decides, in plain words, for the basket page and docs. */
  how: string;
  /** Needs USDC in the basket to park money in. */
  needsCash: boolean;
  /** How often the targets are worked out again. Holders are checked every day either way. */
  cadence: "daily" | "monthly";
}

export const TEMPLATES: Template[] = [
  {
    id: "fixed",
    name: "Fixed Mix",
    short: "Keeps your weights. Trades only when an asset drifts too far.",
    how: "The targets stay at the creator's weights. Each day the agent checks every holder, and trades only when an asset has drifted more than a quarter of its target (at most 5 points) away from it.",
    needsCash: false,
    cadence: "daily",
  },
  {
    id: "equal",
    name: "Equal Weight",
    short: "Every asset gets the same share. Hard to beat, nothing to guess.",
    how: "Every asset's target is the same share of the basket. Drift is fixed the same way as Fixed Mix. Research finds simple equal weights hard to beat, because there is nothing to estimate.",
    needsCash: false,
    cadence: "daily",
  },
  {
    id: "risk",
    name: "Risk Balanced",
    short: "Steadier assets get more, wilder ones less. Recomputed monthly.",
    how: "Once a month, each asset's share is set in inverse proportion to how much its price has swung over the last 90 days, so a calm asset gets more than a wild one. The new targets move only half way from the old ones, so one noisy month can't swing the basket. USDC keeps its starting share.",
    needsCash: false,
    cadence: "monthly",
  },
  {
    id: "trend",
    name: "Trend Guard",
    short: "Moves an asset to USDC while it's below its moving average.",
    how: "An asset stays in while its price is above its average of the last 100 days (crypto) or about 200 trading days (stocks). When it falls more than 3% below, its share moves to USDC; it comes back once it is 3% above. The 3% buffer stops it flipping back and forth. This cuts deep falls but can lag at turning points.",
    needsCash: true,
    cadence: "daily",
  },
  {
    id: "voltarget",
    name: "Volatility Target",
    short: "Holds more USDC when the basket has been swinging hard.",
    how: "When the basket has been swinging more than a target amount (40% a year for crypto baskets, 15% for stock baskets), the agent holds less of the risky assets and more USDC, down to at least 20% invested. It changes only when the right amount moves by more than 10 points.",
    needsCash: true,
    cadence: "daily",
  },
  {
    id: "momentum",
    name: "Momentum Tilt",
    short: "Leans toward recent winners. Trades the most. Recomputed monthly.",
    how: "Once a month, each asset is scored on its 30- and 90-day return for the risk it took. Leaders get up to half again their starting weight, laggards down to half. With USDC in the basket, anything down over 90 days moves to USDC. It trades the most and suffers most when markets turn.",
    needsCash: false,
    cadence: "monthly",
  },
];

export const TEMPLATE_IDS = TEMPLATES.map((t) => t.id);
export const getTemplate = (id: string | null | undefined): Template | null => TEMPLATES.find((t) => t.id === id) ?? null;

/** Why this template can't be used with these assets, or null. */
export function templateProblem(id: TemplateId, assetIds: string[]): string | null {
  const t = getTemplate(id);
  if (!t) return "Pick a strategy from the list.";
  if (t.needsCash && !assetIds.includes("USDC")) return `${t.name} parks money in USDC, so add USDC to the basket.`;
  return null;
}

/**
 * Has a holder drifted far enough to trade? A target's band is a quarter of the target, at most 5 points, and never
 * smaller than 1.5× the asset's minimum swap (so a breach can actually be traded). `weights` and `targets` in bps.
 */
export function outsideBands(rows: { weightBps: number; targetBps: number; minLegUsd: number }[], totalUsd: number): boolean {
  return rows.some((r) => {
    const floor = totalUsd > 0 ? (1.5 * r.minLegUsd * 10_000) / totalUsd : 0;
    const band = Math.max(Math.min(500, 0.25 * r.targetBps), floor);
    return Math.abs(r.weightBps - r.targetBps) > band;
  });
}
