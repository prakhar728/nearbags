// Tiny, safe Markdown subset for theses and deep dives: paragraphs, headings, lists, quotes, code,
// bold/italic and links. No images, no raw HTML: the output is a plain AST rendered as React elements,
// so nothing the creator types is ever injected as HTML.

export type Inline =
  | { t: "text"; v: string }
  | { t: "strong" | "em"; c: Inline[] }
  | { t: "code"; v: string }
  | { t: "link"; href: string; c: Inline[] };

export type Block =
  | { type: "p" | "quote"; inl: Inline[] }
  | { type: "h"; level: 1 | 2 | 3; inl: Inline[] }
  | { type: "ul" | "ol"; items: Inline[][] }
  | { type: "code"; text: string };

/** Only web and mail links survive. Everything else (javascript:, data:, relative) renders as text. */
export function safeHref(raw: string): string | null {
  const href = raw.trim();
  try {
    const u = new URL(href);
    return u.protocol === "https:" || u.protocol === "http:" || u.protocol === "mailto:" ? u.href : null;
  } catch {
    return null;
  }
}

const INLINE = /(`[^`\n]+`)|(!\[[^\]]*\]\([^)\s]*\))|(\[[^\]\n]+\]\([^)\s]+\))|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])|(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*|\b_[^_\n]+_\b)/g;

export function parseInline(s: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  const push = (v: string) => {
    if (!v) return;
    const prev = out[out.length - 1];
    if (prev?.t === "text") prev.v += v;
    else out.push({ t: "text", v });
  };
  for (const m of s.matchAll(INLINE)) {
    const i = m.index!;
    push(s.slice(last, i));
    last = i + m[0].length;
    const [tok, code, image, link, auto, strong, em] = m;
    if (code) out.push({ t: "code", v: code.slice(1, -1) });
    else if (image) {
      // Images are not allowed: keep the alt text only.
      const alt = image.slice(2, image.indexOf("]"));
      push(alt);
    } else if (link) {
      const close = link.indexOf("](");
      const label = link.slice(1, close);
      const href = safeHref(link.slice(close + 2, -1));
      if (href) out.push({ t: "link", href, c: parseInline(label) });
      else push(label);
    } else if (auto) {
      const href = safeHref(auto);
      if (href) out.push({ t: "link", href, c: [{ t: "text", v: auto }] });
      else push(auto);
    } else if (strong) out.push({ t: "strong", c: parseInline(strong.slice(2, -2)) });
    else if (em) out.push({ t: "em", c: parseInline(em.slice(1, -1)) });
    else push(tok);
  }
  push(s.slice(last));
  return out;
}

export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ type: "p", inl: parseInline(para.join(" ")) });
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) {
      flush();
      continue;
    }
    if (trimmed.startsWith("```")) {
      flush();
      const body: string[] = [];
      for (i++; i < lines.length && !lines[i].trim().startsWith("```"); i++) body.push(lines[i]);
      blocks.push({ type: "code", text: body.join("\n") });
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (h) {
      flush();
      blocks.push({ type: "h", level: Math.min(3, h[1].length) as 1 | 2 | 3, inl: parseInline(h[2]) });
      continue;
    }
    const ul = /^[-*+]\s+(.*)$/;
    const ol = /^\d+[.)]\s+(.*)$/;
    if (ul.test(trimmed) || ol.test(trimmed)) {
      flush();
      const kind = ul.test(trimmed) ? "ul" : "ol";
      const re = kind === "ul" ? ul : ol;
      const items: Inline[][] = [];
      for (; i < lines.length && re.test(lines[i].trim()); i++) items.push(parseInline(re.exec(lines[i].trim())![1]));
      i--;
      blocks.push({ type: kind, items });
      continue;
    }
    if (trimmed.startsWith(">")) {
      flush();
      const body: string[] = [];
      for (; i < lines.length && lines[i].trim().startsWith(">"); i++) body.push(lines[i].trim().replace(/^>\s?/, ""));
      i--;
      blocks.push({ type: "quote", inl: parseInline(body.join(" ")) });
      continue;
    }
    para.push(trimmed);
  }
  flush();
  return blocks;
}
