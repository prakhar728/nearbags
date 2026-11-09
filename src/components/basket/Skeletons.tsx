// Loading shapes for basket UI: cards (Explore, creator pages), the backtest block, and the live stat strip.
import { Loading, Skeleton } from "@/components/ui/Skeleton";

/** Same box and rhythm as BasketCard. */
export function CardSkeleton() {
  return (
    <div className="flex min-h-[13.5rem] flex-col gap-3 border border-border bg-bg p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-4 w-2/5" />
          <Skeleton className="h-3.5 w-4/5" />
          <Skeleton className="h-3.5 w-3/5" />
        </div>
        <Skeleton className="h-3 w-16 shrink-0" />
      </div>
      <Skeleton className="h-3 w-1/2" />
      <Skeleton className="mt-auto h-4 w-3/4" />
      <div className="border-t border-border pt-3">
        <Skeleton className="h-3 w-full" />
      </div>
    </div>
  );
}

export function CardGridSkeleton({ count = 6, label = "Loading baskets" }: { count?: number; label?: string }) {
  return (
    <Loading label={label} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: count }, (_, i) => (
        <CardSkeleton key={i} />
      ))}
    </Loading>
  );
}

/** Grid of label/value cells (stat rows, live track record). */
export function CellsSkeleton({ cells, className = "grid-cols-2 sm:grid-cols-4" }: { cells: number; className?: string }) {
  return (
    <div className={`grid border-l border-t border-border ${className}`}>
      {Array.from({ length: cells }, (_, i) => (
        <div key={i} className="space-y-2 border-b border-r border-border p-3">
          <Skeleton className="h-2.5 w-20" />
          <Skeleton className="h-5 w-14" />
        </div>
      ))}
    </div>
  );
}

/** Same layout as BacktestView (+ Pairs on the basket page): window tabs, growth chart, stats, asset chart, bars. */
export function BacktestSkeleton({ compact = false, assets = 4, label = "Running the backtest" }: { compact?: boolean; assets?: number; label?: string }) {
  return (
    <Loading label={label} className="space-y-10">
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-1">
            {["1Y", "3Y", "5Y", "MAX"].map((k) => (
              <div key={k} className="num border border-border px-2.5 py-1 text-[11px] text-faint">
                {k}
              </div>
            ))}
          </div>
          <Skeleton className="h-3 w-44" />
        </div>
        <ChartSkeleton height={compact ? 220 : 300} />
        <Skeleton className="h-2.5 w-3/4" />
        <CellsSkeleton cells={6} className={`grid-cols-2 sm:grid-cols-3 ${compact ? "" : "lg:grid-cols-6"}`} />
      </section>
      <section className="space-y-4">
        <Skeleton className="h-3 w-48" />
        <ChartSkeleton height={compact ? 200 : 260} />
      </section>
      <section className="space-y-4">
        <Skeleton className="h-3 w-56" />
        <div className="space-y-2">
          {Array.from({ length: assets }, (_, i) => (
            <div key={i} className="grid grid-cols-[4rem_1fr_5.5rem] items-center gap-3">
              <Skeleton className="h-3 w-12" />
              <Skeleton className="h-3" style={{ width: `${Math.max(20, 85 - i * 15)}%` }} />
              <Skeleton className="ml-auto h-3 w-12" />
            </div>
          ))}
        </div>
      </section>
    </Loading>
  );
}

/** A chart frame: faint gridlines and no data, at the chart's real height. */
export function ChartSkeleton({ height }: { height: number }) {
  return (
    <div aria-hidden className="relative border border-border" style={{ height }}>
      {[0.25, 0.5, 0.75].map((f) => (
        <div key={f} className="absolute inset-x-0 border-t border-dashed border-border/70" style={{ top: `${f * 100}%` }} />
      ))}
      <div className="absolute inset-0 bg-surface/40 motion-safe:animate-pulse" />
    </div>
  );
}
