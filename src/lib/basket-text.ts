// Thesis template rules (spec §5.3), shared by the creator studio (client) and the API (server).
import { z } from "zod";
import type { Source } from "@/db/schema";
import { RULES, validateWeights } from "@/lib/basket-rules";

export const LIMITS = {
  name: 40,
  tagline: 120,
  thesis: 1500,
  why: 200,
  risks: 600,
  exitSignal: 300,
  deepDive: 10_000,
  sourceClaim: 200,
  sourceTitle: 80,
  sourceUrl: 500,
  sourcesPerAsset: 5,
} as const;

export const HORIZONS = ["3m", "1y", "3y+"] as const;
export type Horizon = (typeof HORIZONS)[number];
export const HORIZON_LABEL: Record<Horizon, string> = { "3m": "3 months", "1y": "1 year", "3y+": "3 years +" };

/** Fields a creator may edit after publish. Name, assets, weights and fee are frozen. */
export const EDITABLE_FIELDS = ["tagline", "thesis", "risks", "exitSignal", "deepDive"] as const;
export type EditableField = (typeof EDITABLE_FIELDS)[number];
export const FIELD_LABEL: Record<string, string> = {
  tagline: "Tagline",
  thesis: "Thesis",
  risks: "Risks",
  exitSignal: "Exit signal",
  deepDive: "Deep dive",
};

const IMAGE_MD = /!\[[^\]]*\]\([^)]*\)/;
const RAW_HTML = /<\/?[a-z][\s\S]*?>/i;

/** Deep dive / thesis Markdown: links are fine, images and raw HTML are not. */
export function markdownProblems(label: string, text: string): string[] {
  const out: string[] = [];
  if (IMAGE_MD.test(text)) out.push(`${label}: images aren't allowed, use a link.`);
  if (RAW_HTML.test(text)) out.push(`${label}: raw HTML isn't allowed.`);
  return out;
}

const required = (label: string, max: number) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required.`)
    .max(max, `${label}: ${max} characters max.`);
const optional = (label: string, max: number) =>
  z
    .string()
    .trim()
    .max(max, `${label}: ${max} characters max.`)
    .optional()
    .nullable()
    // undefined = "not sent" (PATCH leaves it alone); "" or null = clear it.
    .transform((v) => (v === undefined ? undefined : v || null));

export type { Source } from "@/db/schema";

function isPublicHttps(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && !u.username && !u.password && u.hostname.includes(".");
  } catch {
    return false;
  }
}

export const SourceSchema = z.object({
  claim: required("Source claim", LIMITS.sourceClaim),
  title: required("Source title", LIMITS.sourceTitle),
  url: z.string().trim().max(LIMITS.sourceUrl, `Source link: ${LIMITS.sourceUrl} characters max.`).refine(isPublicHttps, "Source link must be a full https:// link."),
});
const SourcesSchema = z.array(SourceSchema).max(LIMITS.sourcesPerAsset, `Up to ${LIMITS.sourcesPerAsset} sources per asset.`);

/** Assets with no source, as "Add a source for X." problems. Used where sources are required (bags made by agents). */
export function missingSources(assets: { assetId: string; sources?: Source[] | null }[]): string[] {
  return assets.filter((a) => !a.sources?.length).map((a) => `Add a source for ${a.assetId}.`);
}

export const CreateBasketSchema = z.object({
  name: required("Name", LIMITS.name),
  tagline: required("Tagline", LIMITS.tagline),
  thesis: required("Thesis", LIMITS.thesis),
  risks: required("Risks", LIMITS.risks),
  horizon: z.enum(HORIZONS, { message: "Pick a time horizon." }),
  exitSignal: optional("Exit signal", LIMITS.exitSignal),
  deepDive: optional("Deep dive", LIMITS.deepDive),
  feeBps: z
    .number()
    .int()
    .min(0)
    .max(RULES.maxCreatorFeeBps, "Fee is 1% max.")
    .refine((v) => v % RULES.creatorFeeStepBps === 0, "Fee moves in 0.05% steps."),
  assets: z
    .array(z.object({ assetId: z.string(), weightBps: z.number().int(), why: required("Why", LIMITS.why), sources: SourcesSchema.optional() }))
    .min(1),
  house: z.boolean().optional(),
  acceptRisk: z.literal(true, { message: "Tick the risk acknowledgement." }),
});
export type CreateBasketInput = z.input<typeof CreateBasketSchema>;

/** Every problem with a create request, in plain words. Empty = OK. */
export function createProblems(body: unknown, opts: { requireSources?: boolean } = {}): { errors: string[]; data?: z.output<typeof CreateBasketSchema> } {
  const p = CreateBasketSchema.safeParse(body);
  if (!p.success) return { errors: [...new Set(p.error.issues.map(issueText))] };
  const d = p.data;
  const errors = [
    ...validateWeights(d.assets),
    ...(opts.requireSources ? missingSources(d.assets) : []),
    ...markdownProblems("Thesis", d.thesis),
    ...(d.deepDive ? markdownProblems("Deep dive", d.deepDive) : []),
  ];
  return errors.length ? { errors } : { errors, data: d };
}

/** Name the asset in per-asset problems: "Why for asset 2: …", "Source for asset 1: …". */
function issueText(i: z.core.$ZodIssue): string {
  if (i.path[0] !== "assets" || typeof i.path[1] !== "number") return i.message;
  const n = i.path[1] + 1;
  if (i.path[2] === "why") return `Why for asset ${n}: ${i.message.replace(/^Why:? ?/, "")}`;
  if (i.path[2] === "sources") return `Sources for asset ${n}: ${i.message}`;
  return i.message;
}

export const PatchBasketSchema = z
  .object({
    tagline: required("Tagline", LIMITS.tagline).optional(),
    thesis: required("Thesis", LIMITS.thesis).optional(),
    risks: required("Risks", LIMITS.risks).optional(),
    exitSignal: optional("Exit signal", LIMITS.exitSignal),
    deepDive: optional("Deep dive", LIMITS.deepDive),
    why: z.record(z.string(), required("Why", LIMITS.why)).optional(),
    // Asset id → its new sources, replacing the old ones. Never empty: an asset with sources keeps at least one.
    sources: z.record(z.string(), SourcesSchema.min(1, "Keep at least one source per asset.")).optional(),
  })
  .strict();

export function slugify(name: string): string {
  const s = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
  return s || "basket";
}
