import Link from "next/link";
import { PageHeader } from "@/components/ui/Primitives";
import { DOCS } from "@/lib/docs";

export const metadata = { title: "Docs · nearbags", description: "How nearbags works: buying, selling, fees, custody, data and architecture." };

export default function DocsIndex() {
  return (
    <div className="grid gap-10">
      <PageHeader kicker="Docs" title="How nearbags works" />
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {DOCS.map((d, i) => (
          <li key={d.slug} className="rise" style={{ "--i": i + 2 } as React.CSSProperties}>
            <Link href={`/docs/${d.slug}`} className="card card-hover group flex h-full flex-col gap-3 p-6">
              <span className="label">{d.audience}</span>
              <span className="font-sans text-lg font-semibold tracking-tight text-text transition-colors group-hover:text-accent-fg">{d.title}</span>
              <span className="text-sm leading-relaxed text-muted">{d.blurb}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
