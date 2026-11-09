"use client";
// Header links (desktop) and a bottom tab bar (phones), with the current section highlighted.
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/explore", label: "EXPLORE", short: "Explore", match: ["/explore", "/b", "/c"] },
  { href: "/create", label: "CREATE", short: "Create", match: ["/create"] },
  { href: "/portfolio", label: "PORTFOLIO", short: "Bags", match: ["/portfolio"] },
  { href: "/thesis", label: "THESIS", short: "Thesis", match: ["/thesis"] },
];

const isOn = (path: string, match: string[]) => match.some((m) => path === m || path.startsWith(`${m}/`));

export function NavLinks() {
  const path = usePathname() ?? "";
  return (
    <div className="hidden items-center gap-1 md:flex">
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} aria-current={isOn(path, l.match) ? "page" : undefined} className="app-nav-link">
          {l.label}
        </Link>
      ))}
    </div>
  );
}

const ICONS: Record<string, React.ReactNode> = {
  "/explore": <path d="M4 5h16M4 12h16M4 19h10" />,
  "/create": <path d="M12 5v14M5 12h14" />,
  "/portfolio": <path d="M5 9h14l-1.2 10H6.2L5 9Zm4 0V7a3 3 0 0 1 6 0v2" />,
  "/thesis": <path d="M4 19l5-6 4 3 7-9" />,
};

export function MobileTabs() {
  const path = usePathname() ?? "";
  return (
    <nav
      aria-label="Sections"
      className="fixed inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom))] z-50 grid grid-cols-4 gap-1 rounded-full border border-[var(--line-strong)] bg-[#111]/85 p-1.5 shadow-[0_20px_50px_-15px_rgba(0,0,0,0.9)] backdrop-blur-xl md:hidden"
    >
      {LINKS.map((l) => {
        const on = isOn(path, l.match);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={on ? "page" : undefined}
            className={`flex h-12 flex-col items-center justify-center gap-0.5 rounded-full font-mono text-[10px] tracking-wide transition-colors ${on ? "bg-accent text-accent-ink" : "text-muted active:bg-white/5"}`}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              {ICONS[l.href]}
            </svg>
            {l.short}
          </Link>
        );
      })}
    </nav>
  );
}
