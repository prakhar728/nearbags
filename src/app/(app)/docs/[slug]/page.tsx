import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DocBody } from "@/components/docs/DocBody";
import { DOCS, loadDoc } from "@/lib/docs";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return DOCS.map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const meta = DOCS.find((d) => d.slug === slug);
  return meta ? { title: `${meta.title} · Stonkbag docs`, description: meta.blurb } : {};
}

// Await params outside Suspense so an unknown page gets a real 404.
export const instant = false;

export default async function DocPage({ params }: Props) {
  const { slug } = await params;
  const doc = await loadDoc(slug);
  if (!doc) notFound();
  const at = DOCS.findIndex((d) => d.slug === slug);
  const prev = DOCS[at - 1];
  const next = DOCS[at + 1];
  const sections = doc.blocks.flatMap((b) => (b.type === "h2" ? [{ id: b.id, text: b.inl.map((n) => ("v" in n ? n.v : "")).join("") }] : []));

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-14">
      <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start">
        <Link href="/docs" className="label transition-colors hover:text-text">
          Docs
        </Link>
        <nav aria-label="Docs" className="-mx-4 mt-3 flex gap-1.5 overflow-x-auto px-4 pb-1 lg:mx-0 lg:grid lg:gap-0.5 lg:overflow-visible lg:px-0">
          {DOCS.map((d) => (
            <Link
              key={d.slug}
              href={`/docs/${d.slug}`}
              aria-current={d.slug === slug ? "page" : undefined}
              className="shrink-0 rounded-full border border-[var(--line)] px-3.5 py-1.5 text-[13px] text-muted transition-colors hover:text-text aria-[current=page]:border-[var(--accent-line)] aria-[current=page]:bg-[var(--accent-soft)] aria-[current=page]:text-text lg:rounded-[var(--r-sm)] lg:border-transparent lg:px-3 lg:py-2"
            >
              {d.title}
            </Link>
          ))}
        </nav>
        {sections.length > 2 && (
          <div className="mt-8 hidden lg:block">
            <div className="label">On this page</div>
            <ul className="mt-3 grid gap-1.5 border-l border-[var(--line)] pl-3">
              {sections.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="text-[12.5px] text-faint transition-colors hover:text-text">
                    {s.text}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>

      <article className="min-w-0">
        <h1 className="display rise text-[clamp(32px,5vw,52px)]" style={{ "--i": 0 } as React.CSSProperties}>
          {doc.title}
        </h1>
        <div className="rise mt-8" style={{ "--i": 1 } as React.CSSProperties}>
          <DocBody blocks={doc.blocks} />
        </div>
        <nav aria-label="More docs" className="mt-14 grid gap-3 border-t border-[var(--line)] pt-8 sm:grid-cols-2">
          {prev ? (
            <Link href={`/docs/${prev.slug}`} className="card card-hover group grid gap-1 p-5">
              <span className="label">Previous</span>
              <span className="font-medium text-text transition-colors group-hover:text-accent">{prev.title}</span>
            </Link>
          ) : (
            <span />
          )}
          {next && (
            <Link href={`/docs/${next.slug}`} className="card card-hover group grid gap-1 p-5 text-right">
              <span className="label">Next</span>
              <span className="font-medium text-text transition-colors group-hover:text-accent">{next.title}</span>
            </Link>
          )}
        </nav>
      </article>
    </div>
  );
}
