// Renders a parsed doc from lib/docs. Text goes through React elements; only the diagram SVGs, which we generate and
// commit ourselves (scripts/docs-diagrams.mjs), are inserted as markup.
import Link from "next/link";
import type { Inline } from "@/lib/markdown";
import { INTERNAL, type DocBlock } from "@/lib/docs";

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
              <code key={i} className="num rounded-[var(--r-xs)] bg-white/[0.07] px-1.5 py-0.5 text-[0.86em] text-text">
                {n.v}
              </code>
            );
          case "link": {
            const cls = "text-text underline decoration-[var(--accent-line)] underline-offset-[3px] transition-colors hover:decoration-accent";
            if (n.href.startsWith(INTERNAL))
              return (
                <Link key={i} href={n.href.slice(INTERNAL.length)} className={cls}>
                  <Inl nodes={n.c} />
                </Link>
              );
            return (
              <a key={i} href={n.href} target="_blank" rel="noopener noreferrer" className={cls}>
                <Inl nodes={n.c} />
              </a>
            );
          }
        }
      })}
    </>
  );
}

function Block({ b }: { b: DocBlock }) {
  switch (b.type) {
    case "h2":
      return (
        <h2 id={b.id} className="scroll-mt-24 pt-6 font-sans text-xl font-semibold tracking-tight text-text first:pt-0">
          <a href={`#${b.id}`} className="group inline-flex items-baseline gap-2">
            <Inl nodes={b.inl} />
            <span className="text-faint opacity-0 transition-opacity group-hover:opacity-100" aria-hidden>
              #
            </span>
          </a>
        </h2>
      );
    case "h3":
      return (
        <h3 className="pt-2 font-sans text-base font-semibold text-text">
          <Inl nodes={b.inl} />
        </h3>
      );
    case "p":
      return (
        <p className="max-w-[68ch]">
          <Inl nodes={b.inl} />
        </p>
      );
    case "qa":
      return (
        <div className="card grid max-w-[68ch] gap-1.5 p-5">
          <p className="font-medium text-text">
            <Inl nodes={b.q} />
          </p>
          <p className="text-muted">
            <Inl nodes={b.a} />
          </p>
        </div>
      );
    case "ul":
    case "ol": {
      const L = b.type;
      return (
        <L className={`grid max-w-[68ch] gap-1.5 pl-5 ${L === "ul" ? "list-disc" : "list-decimal"} marker:text-[var(--accent-line)]`}>
          {b.items.map((it, i) => (
            <li key={i} className="pl-1">
              <Inl nodes={it.inl} />
              {it.sub.length > 0 && (
                <ul className="mt-1.5 grid list-[circle] gap-1 pl-5 marker:text-faint">
                  {it.sub.map((s, j) => (
                    <li key={j}>
                      <Inl nodes={s} />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </L>
      );
    }
    case "table":
      return (
        <div className="tbl-wrap">
          <table className="tbl doc-tbl">
            {b.head && (
              <thead>
                <tr>
                  {b.head.map((c, i) => (
                    <th key={i}>
                      <Inl nodes={c} />
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {b.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((c, j) => (
                    <td key={j}>
                      <Inl nodes={c} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "code":
      return <pre className="num overflow-x-auto rounded-[var(--r-md)] border border-[var(--line)] bg-black/40 p-4 text-[12.5px] leading-relaxed text-text/90">{b.text}</pre>;
    case "diagram":
      return <figure className="doc-diagram" dangerouslySetInnerHTML={{ __html: b.svg }} />;
  }
}

export function DocBody({ blocks }: { blocks: DocBlock[] }) {
  return (
    <div className="grid gap-4 text-[15.5px] leading-[1.7] text-text/80">
      {blocks.map((b, i) => (
        <Block key={i} b={b} />
      ))}
    </div>
  );
}
