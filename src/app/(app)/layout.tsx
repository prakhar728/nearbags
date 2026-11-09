import Link from "next/link";
import { ConnectButton } from "@/components/ConnectButton";
import { MobileTabs, NavLinks } from "@/components/NavLinks";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app">
      <header className="app-header">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link href="/" className="app-logo shrink-0">
            STONKBAG
          </Link>
          <nav className="flex min-w-0 items-center gap-1">
            <NavLinks />
            <div className="md:ml-2">
              <ConnectButton variant="app" />
            </div>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-8 md:pb-20 sm:px-6 sm:pt-12">{children}</main>
      <MobileTabs />
      <footer className="border-t border-[var(--line)] pb-24 md:pb-0">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 sm:flex-row sm:items-end sm:justify-between sm:px-6">
          <div className="space-y-2">
            <div className="app-logo text-[13px] text-muted">STONKBAG</div>
            <p className="fine max-w-xl">
              Historical numbers, not forecasts. Tokenized stocks give price exposure only. Not available to US persons or restricted regions.
            </p>
          </div>
          <nav className="flex flex-wrap gap-1">
            <Link href="/explore" className="app-nav-link">EXPLORE</Link>
            <Link href="/thesis" className="app-nav-link">THESIS</Link>
            <a href="https://github.com/prakhar728/stonkbag" target="_blank" rel="noopener" className="app-nav-link">GITHUB</a>
            <Link href="/terms" className="app-nav-link">TERMS</Link>
            <Link href="/risk" className="app-nav-link">RISKS</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
