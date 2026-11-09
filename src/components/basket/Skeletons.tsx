// Loading shapes for basket UI: cards (Explore, creator pages), the backtest block, and the live stat strip.
import { Loading, Skeleton } from "@/components/ui/Skeleton";

/** Same box and rhythm as BasketCard. */
export function CardSkeleton() {
  return (
    <div className="card flex min-h-[19rem] flex-col gap-5 p-5 sm:p-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-[22px] w-24 rounded-full" />
        <Skeleton className="h-8 w-8 rounded-full" />
      </div>
      <div className="space-y-2.5">
        <Skeleton className="h-6 w-3/5" />
        <Skeleton className="h-3.5 w-4/5" />
      </div>
      <div className="flex gap-1.5">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-7 w-14 rounded-full" />
        ))}
      </div>
      <div className="mt-auto space-y-2">
        <Skeleton className="h-2.5 w-24" />
        <Skeleton className="h-8 w-28" />
      </div>
      <div className="border-t border-[var(--line)] pt-4">
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
    <div className={`stat-grid ${className}`}>
      {Array.from({ length: cells }, (_, i) => (
        <div key={i} className="space-y-2.5">
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
    <Loading label={label} className="space-y-6">
      <section className={`card space-y-5 ${compact ? "p-4" : "card-pad"}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="seg">
            {["1Y", "3Y", "5Y", "MAX"].map((k) => (
              <div key={k} className="seg-item text-faint">
                {k}
              </div>
            ))}
          </div>
          <Skeleton className="h-3 w-44" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-2.5 w-40" />
          <Skeleton className="h-9 w-36" />
        </div>
        <ChartSkeleton height={compact ? 220 : 300} />
      </section>
      <CellsSkeleton cells={6} className={`grid-cols-2 sm:grid-cols-3 ${compact ? "" : "lg:grid-cols-6"}`} />
      <section className={`card space-y-4 ${compact ? "p-4" : "card-pad"}`}>
        <Skeleton className="h-3 w-48" />
        <ChartSkeleton height={compact ? 200 : 260} />
      </section>
      <section className={`card space-y-4 ${compact ? "p-4" : "card-pad"}`}>
        <Skeleton className="h-3 w-56" />
        <div className="space-y-3">
          {Array.from({ length: assets }, (_, i) => (
            <div key={i} className="grid grid-cols-[4rem_1fr_5.5rem] items-center gap-3">
              <Skeleton className="h-3 w-12" />
              <Skeleton className="h-2.5 rounded-full" style={{ width: `${Math.max(20, 85 - i * 15)}%` }} />
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
    <div aria-hidden className="relative overflow-hidden rounded-[var(--r-md)]" style={{ height }}>
      {[0.25, 0.5, 0.75].map((f) => (
        <div key={f} className="absolute inset-x-0 border-t border-dashed border-[var(--line)]" style={{ top: `${f * 100}%` }} />
      ))}
      <div className="absolute inset-0 bg-white/[0.02] motion-safe:animate-pulse" />
    </div>
  );
}
