// Thesis template rules (spec §5.3), shared by the creator studio (client) and the API (server).
import { z } from "zod";
import { RULES, validateWeights } from "@/lib/basket-rules";

export const LIMITS = {
  name: 40,
  tagline: 120,
  thesis: 1500,
  why: 200,
  risks: 600,
  exitSignal: 300,
  deepDive: 10_000,
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
    .array(z.object({ assetId: z.string(), weightBps: z.number().int(), why: required("Why", LIMITS.why) }))
    .min(1),
  house: z.boolean().optional(),
  acceptRisk: z.literal(true, { message: "Tick the risk acknowledgement." }),
});
export type CreateBasketInput = z.input<typeof CreateBasketSchema>;

/** Every problem with a create request, in plain words. Empty = OK. */
export function createProblems(body: unknown): { errors: string[]; data?: z.output<typeof CreateBasketSchema> } {
  const p = CreateBasketSchema.safeParse(body);
  if (!p.success) return { errors: [...new Set(p.error.issues.map((i) => (i.path[0] === "assets" && i.path[2] === "why" ? `Why for asset ${Number(i.path[1]) + 1}: ${i.message.replace(/^Why:? ?/, "")}` : i.message)))] };
  const d = p.data;
  const errors = [
    ...validateWeights(d.assets),
    ...markdownProblems("Thesis", d.thesis),
    ...(d.deepDive ? markdownProblems("Deep dive", d.deepDive) : []),
  ];
  return errors.length ? { errors } : { errors, data: d };
}

export const PatchBasketSchema = z
  .object({
    tagline: required("Tagline", LIMITS.tagline).optional(),
    thesis: required("Thesis", LIMITS.thesis).optional(),
    risks: required("Risks", LIMITS.risks).optional(),
    exitSignal: optional("Exit signal", LIMITS.exitSignal),
    deepDive: optional("Deep dive", LIMITS.deepDive),
    why: z.record(z.string(), required("Why", LIMITS.why)).optional(),
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
