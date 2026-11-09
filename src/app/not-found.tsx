import Link from "next/link";

export default function NotFound() {
  return (
    <div className="space-y-4 py-16">
      <div className="num text-xs text-faint">404</div>
      <h1 className="font-mono text-2xl font-semibold">Nothing in this bag.</h1>
      <p className="text-sm text-muted">That link doesn&apos;t point to a basket or a creator.</p>
      <Link href="/" className="inline-block border border-border px-3 py-1.5 font-mono text-xs hover:border-border-strong">
        Back to Explore
      </Link>
    </div>
  );
}
