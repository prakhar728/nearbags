"use client";
// Navigation in three shapes, the current section highlighted in each: a dark sidebar on wide screens (near.com's
// dashboard), text links in the header on tablets and laptops, and a dark tab dock on phones.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { GITHUB_URL, TELEGRAM_URL } from "@/lib/links";

const LINKS = [
  { href: "/explore", label: "Explore", short: "Explore", match: ["/explore", "/b", "/c"] },
  { href: "/create", label: "Create", short: "Create", match: ["/create"] },
  { href: "/portfolio", label: "Portfolio", short: "Bags", match: ["/portfolio"] },
  { href: "/thesis", label: "Thesis", short: "Thesis", match: ["/thesis"] },
  { href: "/docs", label: "Docs", short: "Docs", match: ["/docs"], desktopOnly: true },
];

const isOn = (path: string, match: string[]) => match.some((m) => path === m || path.startsWith(`${m}/`));

const ICONS: Record<string, React.ReactNode> = {
  "/explore": (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.2-4.2" />
    </>
  ),
  "/create": (
    <>
      <rect x="4" y="4" width="16" height="16" rx="4" />
      <path d="M12 8.5v7M8.5 12h7" />
    </>
  ),
  "/portfolio": <path d="M5 9h14l-1.2 10H6.2L5 9Zm4 0V7a3 3 0 0 1 6 0v2" />,
  "/thesis": <path d="M4 19l5-6 4 3 7-9" />,
  "/docs": (
    <>
      <path d="M6 4h9l3 3v13H6z" />
      <path d="M9 11h6M9 15h6" />
    </>
  ),
  "/risk": (
    <>
      <path d="M12 4 3.5 19h17z" />
      <path d="M12 10v4M12 16.5v.5" />
    </>
  ),
  "/terms": (
    <>
      <rect x="5" y="4" width="14" height="16" rx="2" />
      <path d="M9 9h6M9 13h6M9 17h3" />
    </>
  ),
  telegram: <path d="M21 4 3 11l6 2.5M21 4l-3 16-9-6.5M21 4 9 13.5v5l3-3.2" />,
  github: (
    <>
      <path d="M9 19c-4 1.3-4-2-6-2.5" />
      <path d="M15 21v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.3 4.3 0 0 0-.1-3.2s-1-.3-3.4 1.3a11.6 11.6 0 0 0-6.2 0C6.6 2.8 5.6 3.1 5.6 3.1a4.3 4.3 0 0 0-.1 3.2A4.6 4.6 0 0 0 4.2 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21" />
    </>
  ),
};

function Icon({ name, size = 20 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {ICONS[name]}
    </svg>
  );
}

/** Header links, tablets and laptops (the sidebar takes over from 1280px). */
export function NavLinks() {
  const path = usePathname() ?? "";
  return (
    <div className="hidden items-center gap-0.5 md:flex xl:hidden">
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} aria-current={isOn(path, l.match) ? "page" : undefined} className="app-nav-link">
          {l.label}
        </Link>
      ))}
    </div>
  );
}

const MORE = [
  { href: "/risk", label: "Risks" },
  { href: "/terms", label: "Terms" },
];

/** Dark sidebar, 1280px and up. */
export function SideNav() {
  const path = usePathname() ?? "";
  return (
    <nav aria-label="Sections" className="side-nav">
      {LINKS.filter((l) => l.href !== "/thesis" && l.href !== "/docs").map((l) => (
        <Link key={l.href} href={l.href} aria-current={isOn(path, l.match) ? "page" : undefined} className="side-link">
          <Icon name={l.href} />
          {l.label}
        </Link>
      ))}
      <div className="side-group">Learn</div>
      {LINKS.filter((l) => l.href === "/thesis" || l.href === "/docs").map((l) => (
        <Link key={l.href} href={l.href} aria-current={isOn(path, l.match) ? "page" : undefined} className="side-link">
          <Icon name={l.href} />
          {l.label}
        </Link>
      ))}
      {MORE.map((l) => (
        <Link key={l.href} href={l.href} aria-current={path === l.href ? "page" : undefined} className="side-link">
          <Icon name={l.href} />
          {l.label}
        </Link>
      ))}
      <a href={TELEGRAM_URL} target="_blank" rel="noopener" className="side-link">
        <Icon name="telegram" />
        Telegram
      </a>
      <a href={GITHUB_URL} target="_blank" rel="noopener" className="side-link">
        <Icon name="github" />
        GitHub
      </a>
    </nav>
  );
}

export function MobileTabs() {
  const path = usePathname() ?? "";
  return (
    <nav aria-label="Sections" className="tabbar">
      {LINKS.filter((l) => !l.desktopOnly).map((l) => {
        const on = isOn(path, l.match);
        return (
          <Link key={l.href} href={l.href} aria-current={on ? "page" : undefined} className="tab">
            <Icon name={l.href} size={20} />
            {l.short}
          </Link>
        );
      })}
    </nav>
  );
}
