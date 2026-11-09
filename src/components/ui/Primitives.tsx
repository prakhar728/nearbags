// Shared building blocks for every page outside the landing. Styles live in src/app/ui.css (layer "components"),
// so Tailwind utilities passed through className still win. Server-safe: no hooks.
import Link from "next/link";

type Children = { children?: React.ReactNode };
const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/** Page title block: small mono kicker, wide display headline, one line of context, optional actions on the right. */
export function PageHeader({
  kicker,
  title,
  description,
  actions,
  className,
}: {
  kicker?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cx("flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0 space-y-3">
        {kicker && (
          <div className="label rise flex items-center gap-2" style={{ "--i": 0 } as React.CSSProperties}>
            {kicker}
          </div>
        )}
        <h1 className="display rise text-[clamp(34px,6vw,64px)]" style={{ "--i": 1 } as React.CSSProperties}>
          {title}
        </h1>
        {description && (
          <p className="rise max-w-2xl text-[15px] leading-relaxed text-muted" style={{ "--i": 2 } as React.CSSProperties}>
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="rise flex shrink-0 flex-wrap items-center gap-2" style={{ "--i": 3 } as React.CSSProperties}>
          {actions}
        </div>
      )}
    </header>
  );
}

/** Section heading: mono label with an optional right-hand slot (filters, links, actions). */
export function SectionHead({ title, right, className }: { title: React.ReactNode; right?: React.ReactNode; className?: string }) {
  return (
    <div className={cx("flex flex-wrap items-center justify-between gap-3", className)}>
      <h2 className="label flex items-center gap-2 text-muted">
        <span className="inline-block h-px w-5 bg-accent/70" aria-hidden />
        {title}
      </h2>
      {right}
    </div>
  );
}

export function Section({ title, right, children, className }: Children & { title: React.ReactNode; right?: React.ReactNode; className?: string }) {
  return (
    <section className={cx("space-y-4", className)}>
      <SectionHead title={title} right={right} />
      {children}
    </section>
  );
}

export function Card({ children, className, pad = true, hover = false, ticks = false, as: As = "div" }: Children & { className?: string; pad?: boolean; hover?: boolean; ticks?: boolean; as?: "div" | "section" | "article" }) {
  return <As className={cx("card", pad && "card-pad", hover && "card-hover", ticks && "card-ticks", className)}>{children}</As>;
}

/** One figure with its label. `size="lg"` uses the wide display face. */
export function Stat({ label, value, sub, tone, size = "md" }: { label: React.ReactNode; value: React.ReactNode; sub?: React.ReactNode; tone?: string; size?: "md" | "lg" }) {
  return (
    <div className="min-w-0">
      <div className="label">{label}</div>
      <div className={cx(size === "lg" ? "big-num mt-2 text-[clamp(30px,4.5vw,44px)]" : "stat-value", tone)}>{value}</div>
      {sub && <div className="num mt-1.5 text-[11px] text-muted">{sub}</div>}
    </div>
  );
}

type BtnVariant = "primary" | "secondary" | "ghost" | "danger";
const btnCls = (variant: BtnVariant, size?: "sm", block?: boolean, className?: string) => cx("btn", `btn-${variant}`, size === "sm" && "btn-sm", block && "btn-block", className);

export function ButtonLink({ href, variant = "secondary", size, block, className, children, ...rest }: Children & { href: string; variant?: BtnVariant; size?: "sm"; block?: boolean; className?: string; target?: string; rel?: string }) {
  return (
    <Link href={href} className={btnCls(variant, size, block, className)} {...rest}>
      {children}
    </Link>
  );
}

export const buttonClass = btnCls;

/** Empty state: a dashed rounded panel with a message and optional actions. */
export function Empty({ title, children, actions }: Children & { title: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="grid place-items-center gap-4 rounded-[var(--r-xl)] border border-dashed border-[var(--line-strong)] bg-[var(--layer-1)] px-6 py-12 text-center">
      <div className="display text-2xl">{title}</div>
      {children && <div className="max-w-md text-sm leading-relaxed text-muted">{children}</div>}
      {actions && <div className="flex flex-wrap justify-center gap-2">{actions}</div>}
    </div>
  );
}
