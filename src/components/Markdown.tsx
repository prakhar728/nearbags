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
              <code key={i} className="font-mono rounded-md bg-[var(--surface-2)] px-1.5 py-0.5 text-[0.88em]">
                {n.v}
              </code>
            );
          case "link":
            return (
              <a key={i} href={n.href} target="_blank" rel="noopener noreferrer nofollow ugc" className="text-text underline decoration-border-strong underline-offset-2 hover:decoration-text">
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
        <blockquote className="rounded-r-[var(--r-sm)] border-l-2 border-accent bg-[var(--surface)] py-2 pl-4 pr-3 text-muted">
          <Inl nodes={b.inl} />
        </blockquote>
      );
    case "h": {
      const H = b.level === 1 ? "h3" : "h4";
      return (
        <H className={`pt-2 font-semibold tracking-tight text-text ${b.level === 1 ? "text-base" : "text-[15px]"}`}>
          <Inl nodes={b.inl} />
        </H>
      );
    }
    case "ul":
    case "ol": {
      const L = b.type;
      return (
        <L className={`space-y-1 pl-5 ${b.type === "ul" ? "list-disc" : "list-decimal"} marker:text-muted`}>
          {b.items.map((it, i) => (
            <li key={i}>
              <Inl nodes={it} />
            </li>
          ))}
        </L>
      );
    }
    case "code":
      return <pre className="font-mono overflow-x-auto rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface)] p-4 text-xs">{b.text}</pre>;
  }
}

export function Markdown({ text, className = "" }: { text: string; className?: string }) {
  const blocks = parseMarkdown(text);
  return (
    <div className={`space-y-3 text-[15px] leading-[1.7] text-text/85 ${className}`}>
      {blocks.map((b, i) => (
        <B key={i} b={b} />
      ))}
    </div>
  );
}
