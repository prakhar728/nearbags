// Renders the safe Markdown subset from lib/markdown as React elements (never as raw HTML).
import { parseMarkdown, type Block, type Inline } from "@/lib/markdown";

function Inl({ nodes }: { nodes: Inline[] }) {
  return (
    <>
      {nodes.map((n, i) => {
        switch (n.t) {
          case "text":
            return <span key={i}>{n.v}</span>;
          case "strong":
            return (
              <strong key={i} className="font-semibold text-text">
                <Inl nodes={n.c} />
              </strong>
            );
          case "em":
            return (
              <em key={i}>
                <Inl nodes={n.c} />
              </em>
            );
          case "code":
            return (
              <code key={i} className="num bg-surface-2 px-1 text-[0.9em]">
                {n.v}
              </code>
            );
          case "link":
            return (
              <a key={i} href={n.href} target="_blank" rel="noopener noreferrer nofollow ugc" className="text-text underline decoration-border-strong underline-offset-2 hover:decoration-accent">
                <Inl nodes={n.c} />
              </a>
            );
        }
      })}
    </>
  );
}

function B({ b }: { b: Block }) {
  switch (b.type) {
    case "p":
      return (
        <p>
          <Inl nodes={b.inl} />
        </p>
      );
    case "quote":
      return (
        <blockquote className="border-l border-border-strong pl-3 text-muted">
          <Inl nodes={b.inl} />
        </blockquote>
      );
    case "h": {
      const H = b.level === 1 ? "h3" : "h4";
      return (
        <H className={`pt-2 font-mono uppercase tracking-wider text-text ${b.level === 1 ? "text-sm" : "text-xs"}`}>
          <Inl nodes={b.inl} />
        </H>
      );
    }
    case "ul":
    case "ol": {
      const L = b.type;
      return (
        <L className={`space-y-1 pl-5 ${b.type === "ul" ? "list-disc" : "list-decimal"} marker:text-faint`}>
          {b.items.map((it, i) => (
            <li key={i}>
              <Inl nodes={it} />
            </li>
          ))}
        </L>
      );
    }
    case "code":
      return <pre className="num overflow-x-auto border border-border bg-surface p-3 text-xs">{b.text}</pre>;
  }
}

export function Markdown({ text, className = "" }: { text: string; className?: string }) {
  const blocks = parseMarkdown(text);
  return (
    <div className={`space-y-3 text-sm leading-relaxed text-text/90 ${className}`}>
      {blocks.map((b, i) => (
        <B key={i} b={b} />
      ))}
    </div>
  );
}
