// /docs renders the Markdown files in docs/ (the same files GitHub shows). They are ours, not user content, so this
// parser covers what they use: headings, paragraphs, lists (one nested level), tables, code, Mermaid diagrams
// (drawn ahead of time by `pnpm docs:diagrams`) and question-and-answer paragraphs.
import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { cacheLife } from "next/cache";
import { parseInline, type Inline } from "@/lib/markdown";

export const DOCS = [
  { slug: "how-it-works", title: "How it works", audience: "Everyone", blurb: "What a bag is, and how buying, selling and creating work" },
  { slug: "fees", title: "Fees", audience: "Everyone", blurb: "What a buy and a sell cost, with a real example" },
  { slug: "safety", title: "Safety and custody", audience: "Everyone", blurb: "Who holds the money, and what happens if Stonkbag goes away" },
  { slug: "data", title: "Prices and numbers", audience: "Everyone", blurb: "Where every number comes from, and what is live" },
  { slug: "architecture", title: "Architecture", audience: "Engineers", blurb: "Components, the order flow, database and API" },
  { slug: "operations", title: "Operations", audience: "Whoever runs it", blurb: "Settings, scheduled jobs, admin controls, fixing common problems" },
] as const;
export type DocSlug = (typeof DOCS)[number]["slug"];

export type DocBlock =
  | { type: "h2"; id: string; inl: Inline[] }
  | { type: "h3"; inl: Inline[] }
  | { type: "p"; inl: Inline[] }
  | { type: "qa"; q: Inline[]; a: Inline[] }
  | { type: "ul" | "ol"; items: { inl: Inline[]; sub: Inline[][] }[] }
  | { type: "table"; head: Inline[][] | null; rows: Inline[][][] }
  | { type: "code"; text: string }
  | { type: "diagram"; svg: string };

export interface Doc {
  slug: DocSlug;
  title: string;
  blocks: DocBlock[];
}

/** Links between docs become site paths. INTERNAL marks them so the renderer uses next/link. */
export const INTERNAL = "https://stonkbag.internal";
const SLUGS = new Set<string>(DOCS.map((d) => d.slug));
function resolveLinks(md: string) {
  return md.replace(/\]\(([^)\s]+)\)/g, (all, href: string) => {
    if (href === "../THESIS.md") return `](${INTERNAL}/thesis)`;
    const m = /^([a-z-]+)\.md(#[\w-]+)?$/.exec(href);
    if (m && SLUGS.has(m[1])) return `](${INTERNAL}/docs/${m[1]}${m[2] ?? ""})`;
    if (m && m[1] === "README") return `](${INTERNAL}/docs)`;
    return all;
  });
}

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const cells = (line: string) => line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

export function parseDoc(src: string, diagrams: string[]): { title: string; blocks: DocBlock[] } {
  const lines = resolveLinks(src).replace(/\r\n?/g, "\n").split("\n");
  const blocks: DocBlock[] = [];
  let title = "";
  let para: string[] = [];
  let diagram = 0;
  const flush = () => {
    if (!para.length) return;
    const q = /^\*\*(.+)\*\*$/.exec(para[0]);
    if (q && para.length > 1) blocks.push({ type: "qa", q: parseInline(q[1]), a: parseInline(para.slice(1).join(" ")) });
    else blocks.push({ type: "p", inl: parseInline(para.join(" ")) });
    para = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const t = line.trim();
    if (!t) {
      flush();
      continue;
    }
    if (t.startsWith("```")) {
      flush();
      const lang = t.slice(3).trim();
      const body: string[] = [];
      for (i++; i < lines.length && !lines[i].trim().startsWith("```"); i++) body.push(lines[i]);
      if (lang === "mermaid") {
        const svg = diagrams[diagram++];
        if (svg) blocks.push({ type: "diagram", svg });
      } else blocks.push({ type: "code", text: body.join("\n") });
      continue;
    }
    const h = /^(#{1,3})\s+(.*)$/.exec(t);
    if (h) {
      flush();
      if (h[1].length === 1) title = h[2];
      else if (h[1].length === 2) blocks.push({ type: "h2", id: slugify(h[2]), inl: parseInline(h[2]) });
      else blocks.push({ type: "h3", inl: parseInline(h[2]) });
      continue;
    }
    if (t.startsWith("|")) {
      flush();
      const rows: string[][] = [];
      for (; i < lines.length && lines[i].trim().startsWith("|"); i++) rows.push(cells(lines[i]));
      i--;
      const hasHead = rows[1]?.every((c) => /^:?-+:?$/.test(c));
      const head = hasHead ? rows[0] : null;
      const body = hasHead ? rows.slice(2) : rows;
      blocks.push({ type: "table", head: head && head.some(Boolean) ? head.map(parseInline) : null, rows: body.map((r) => r.map(parseInline)) });
      continue;
    }
    const ul = /^[-*]\s+(.*)$/;
    const ol = /^\d+\.\s+(.*)$/;
    if (!/^\s/.test(line) && (ul.test(t) || ol.test(t))) {
      flush();
      const kind = ul.test(t) ? "ul" : "ol";
      const re = kind === "ul" ? ul : ol;
      const items: { inl: Inline[]; sub: Inline[][] }[] = [];
      for (; i < lines.length; i++) {
        const l = lines[i];
        const top = !/^\s/.test(l) && re.exec(l.trim());
        const sub = /^\s+/.test(l) && ul.exec(l.trim());
        if (top) items.push({ inl: parseInline(top[1]), sub: [] });
        else if (sub && items.length) items[items.length - 1].sub.push(parseInline(sub[1]));
        else break;
      }
      i--;
      blocks.push({ type: kind, items });
      continue;
    }
    para.push(t);
  }
  flush();
  return { title, blocks };
}

const DIR = path.join(process.cwd(), "docs");

export async function loadDoc(slug: string): Promise<Doc | null> {
  "use cache";
  cacheLife("max"); // the files only change with a commit, which means a new build
  const meta = DOCS.find((d) => d.slug === slug);
  if (!meta) return null;
  const src = await readFile(path.join(DIR, `${slug}.md`), "utf8");
  const count = (src.match(/^```mermaid$/gm) ?? []).length;
  const diagrams = await Promise.all(Array.from({ length: count }, (_, i) => readFile(path.join(DIR, "diagrams", `${slug}-${i + 1}.svg`), "utf8").catch(() => "")));
  const { title, blocks } = parseDoc(src, diagrams);
  return { slug: meta.slug, title: title || meta.title, blocks };
}
