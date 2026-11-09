// Placeholder blocks shown while content loads, shaped like what replaces them so nothing jumps when it arrives.
// No pulse when the visitor prefers reduced motion. Works in server and client components.

/** One grey block. Size it with className (h-*, w-*). */
export function Skeleton({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return <div aria-hidden className={`bg-surface-2 motion-safe:animate-pulse ${className}`} style={style} />;
}

/** A line of text, inline. Height follows the surrounding font size. */
export function SkeletonText({ className = "w-16" }: { className?: string }) {
  return <span aria-hidden className={`inline-block h-[0.9em] translate-y-[0.1em] bg-surface-2 motion-safe:animate-pulse ${className}`} />;
}

/** Wraps a skeleton so screen readers hear one "loading" message instead of nothing. */
export function Loading({ label = "Loading", className = "", children }: { label?: string; className?: string; children: React.ReactNode }) {
  return (
    <div role="status" aria-live="polite" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

/** A small caption under a skeleton, for waits that take more than a moment. */
export function LoadingNote({ children }: { children: React.ReactNode }) {
  return <p className="num text-[11px] text-faint">{children}</p>;
}
