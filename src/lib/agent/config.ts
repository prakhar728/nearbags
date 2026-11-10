// An agent-managed basket's settings: the creator's private strategy and the limits the agent must stay inside.
import type { AgentConfig } from "@/db/schema";
import { templateProblem, type TemplateId } from "./templates";

export const DEFAULT_LIMITS: AgentConfig["limits"] = { minWeightBps: 500, maxWeightBps: 6000, maxChangeBps: 1500, maxTurnoverBps: 2000 };

/**
 * The lowest cap on one asset that still lets the agent move: 10 points above an even split. With two assets a cap of
 * 50% would freeze the basket at 50/50.
 */
export const minMaxWeightBps = (assetCount: number) => Math.min(8000, Math.ceil(10_000 / Math.max(1, assetCount)) + 1000);

/**
 * Validate what a creator sent (throws a plain Error with the reason). Limits are clamped into safe ranges, with the
 * cap on one asset raised to minMaxWeightBps(assetCount) if needed; the strategist clamps again with hard caps.
 */
export function sanitizeAgentConfig(input: unknown, assets: { assetId: string; weightBps: number }[]): AgentConfig {
  const assetCount = assets.length;
  const o = (input ?? {}) as Partial<Omit<AgentConfig, "template">> & { template?: unknown };
  // A template (picked from the list) or the creator's own strategy for the AI, not both.
  const tid = typeof o.template === "string" ? o.template : ((o.template as { id?: unknown } | null)?.id ?? null);
  let template: AgentConfig["template"] = null;
  if (tid != null) {
    const problem = templateProblem(String(tid) as TemplateId, assets.map((a) => a.assetId));
    if (problem) throw new Error(problem);
    template = { id: String(tid) as TemplateId, baseBps: Object.fromEntries(assets.map((a) => [a.assetId, a.weightBps])) };
  }
  const strategy = template ? "" : String(o.strategy ?? "").trim();
  if (!template && strategy.length < 20) throw new Error("Describe the agent's strategy in at least a sentence.");
  if (strategy.length > 2000) throw new Error("Keep the strategy under 2,000 characters.");
  const l = { ...DEFAULT_LIMITS, ...(o.limits ?? {}) };
  const int = (v: unknown, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(Number(v) || 0)));
  return {
    strategy,
    template,
    limits: {
      minWeightBps: int(l.minWeightBps, 0, 2000),
      maxWeightBps: int(l.maxWeightBps, minMaxWeightBps(assetCount), 8000),
      maxChangeBps: int(l.maxChangeBps, 100, 5000),
      maxTurnoverBps: int(l.maxTurnoverBps, 100, 3000),
    },
  };
}

/** True when two intent payloads are the same apart from their nonce. */
export function sameButNonce(a: string, b: string): boolean {
  try {
    const x = JSON.parse(a);
    const y = JSON.parse(b);
    delete x.nonce;
    delete y.nonce;
    return JSON.stringify(x) === JSON.stringify(y);
  } catch {
    return false;
  }
}
