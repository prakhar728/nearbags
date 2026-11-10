import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 space-y-4 px-4 py-24">
      <div className="badge">404</div>
      <h1 className="display text-[40px]">Nothing in this bag.</h1>
      <p className="text-[15px] text-muted">That link doesn&apos;t point to a basket or a creator.</p>
      <div className="flex gap-3 pt-2">
        <Link href="/explore" className="btn btn-primary btn-sm">
          Explore baskets
        </Link>
        <Link href="/" className="btn btn-secondary btn-sm">
          Home
        </Link>
      </div>
    </main>
  );
}
