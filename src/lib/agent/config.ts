// An agent-managed basket's settings: the creator's private strategy and the limits the agent must stay inside.
import type { AgentConfig } from "@/db/schema";

export const DEFAULT_LIMITS: AgentConfig["limits"] = { minWeightBps: 500, maxWeightBps: 6000, maxChangeBps: 1500, maxTurnoverBps: 2000 };

/** Validate what a creator sent (throws a plain Error with the reason). Limits are clamped into safe ranges; the strategist clamps again with hard caps. */
export function sanitizeAgentConfig(input: unknown): AgentConfig {
  const o = (input ?? {}) as Partial<AgentConfig>;
  const strategy = String(o.strategy ?? "").trim();
  if (strategy.length < 20) throw new Error("Describe the agent's strategy in at least a sentence.");
  if (strategy.length > 2000) throw new Error("Keep the strategy under 2,000 characters.");
  const l = { ...DEFAULT_LIMITS, ...(o.limits ?? {}) };
  const int = (v: unknown, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(Number(v) || 0)));
  return {
    strategy,
    limits: {
      minWeightBps: int(l.minWeightBps, 0, 2000),
      maxWeightBps: int(l.maxWeightBps, 2000, 8000),
      maxChangeBps: int(l.maxChangeBps, 100, 5000),
      maxTurnoverBps: int(l.maxTurnoverBps, 100, 3000),
    },
  };
}
