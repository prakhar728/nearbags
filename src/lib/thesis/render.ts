// Renders THESIS.template.md: every {{key}} must be a field of the generated summary (or generated_at). An unknown key
// throws, so the document can never carry a number that did not come from data/thesis/thesis.json.
import { pct, usd } from "@/lib/format";
import type { ThesisData, ThesisSummary } from "./types";

const PLACEHOLDER = /\{\{\s*([a-z0-9_]+)\s*\}\}/g;

export function formatValue(key: string, v: string | number | null): string {
  if (v == null) return "n/a";
  if (typeof v === "string") return v;
  if (/share|change/.test(key)) return pct(v, 1, key.endsWith("change_30d"));
  if (/volume|usd|tvl/.test(key)) return usd(v);
  return v.toLocaleString("en-US");
}

export function placeholderValues(d: Pick<ThesisData, "generatedAt" | "summary">): Record<string, string> {
  const out: Record<string, string> = { generated_at: d.generatedAt.slice(0, 16).replace("T", " ") + " UTC" };
  for (const [k, v] of Object.entries(d.summary) as [keyof ThesisSummary, ThesisSummary[keyof ThesisSummary]][]) out[k] = formatValue(k, v);
  return out;
}

export function renderTemplate(template: string, values: Record<string, string>): string {
  const missing = new Set<string>();
  const text = template.replace(PLACEHOLDER, (_, key: string) => {
    if (!(key in values)) {
      missing.add(key);
      return "";
    }
    return values[key];
  });
  if (missing.size) throw new Error(`THESIS.template.md uses unknown placeholders: ${[...missing].join(", ")}`);
  return text;
}
