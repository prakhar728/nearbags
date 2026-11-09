// Creator profile rules (spec §5.8, Q13), shared by the profile form and PATCH /api/profile.
import { z } from "zod";

export const HANDLE_RE = /^[a-z0-9_]{3,20}$/;
export const BIO_MAX = 160;
const RESERVED = new Set(["admin", "stonkbag", "house", "api", "create", "portfolio", "support", "help"]);

/** Accepts x.com / twitter.com profile URLs (or a bare @name) and returns https://x.com/name, else null. */
export function normalizeXUrl(raw: string): string | null {
  const s = raw.trim();
  const bare = /^@?([A-Za-z0-9_]{1,15})$/.exec(s);
  if (bare) return `https://x.com/${bare[1]}`;
  const m = /^(?:https?:\/\/)?(?:www\.|mobile\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/?(?:[?#].*)?$/i.exec(s);
  return m ? `https://x.com/${m[1]}` : null;
}

export const ProfileSchema = z
  .object({
    handle: z
      .string()
      .trim()
      .toLowerCase()
      .regex(HANDLE_RE, "Handle: 3–20 characters, a–z, 0–9 and _ only.")
      .optional(),
    bio: z.string().trim().max(BIO_MAX, `Bio: ${BIO_MAX} characters max.`).optional(),
    xUrl: z.string().trim().max(200).optional(),
  })
  .strict();

export function profileProblems(body: unknown, opts: { admin?: boolean } = {}) {
  const p = ProfileSchema.safeParse(body);
  if (!p.success) return { errors: [...new Set(p.error.issues.map((i) => i.message))] };
  const d = p.data;
  const errors: string[] = [];
  if (d.handle && RESERVED.has(d.handle) && !opts.admin) errors.push("That handle is reserved.");
  let xUrl: string | null | undefined = undefined;
  if (d.xUrl !== undefined) {
    xUrl = d.xUrl === "" ? null : normalizeXUrl(d.xUrl);
    if (d.xUrl !== "" && !xUrl) errors.push("X link: use a profile link like https://x.com/name.");
  }
  return errors.length ? { errors } : { errors, data: { handle: d.handle, bio: d.bio === undefined ? undefined : d.bio || null, xUrl } };
}
