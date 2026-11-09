import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 space-y-4 px-4 py-24">
      <div className="num text-xs text-faint">404</div>
      <h1 className="font-mono text-2xl font-semibold">Nothing in this bag.</h1>
      <p className="text-sm text-muted">That link doesn&apos;t point to a basket or a creator.</p>
      <div className="flex gap-3">
        <Link href="/explore" className="inline-block border border-border px-3 py-1.5 font-mono text-xs hover:border-border-strong">
          Explore baskets
        </Link>
        <Link href="/" className="inline-block border border-border px-3 py-1.5 font-mono text-xs text-muted hover:border-border-strong">
          Home
        </Link>
      </div>
    </main>
  );
}
