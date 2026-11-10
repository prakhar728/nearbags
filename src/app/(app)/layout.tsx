import Link from "next/link";
import { ConnectButton } from "@/components/ConnectButton";
import { Logo } from "@/components/Logo";
import { MobileTabs, NavLinks, SideNav } from "@/components/NavLinks";
import { BackButton, NavTracker } from "@/components/BackButton";
import { InstallBanner, InstallButton } from "@/components/pwa/Install";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app">
      <aside className="app-side theme-dark">
        <div className="side-head">
          <Logo href="/" />
        </div>
        <SideNav />
        <p className="side-foot">
          Historical numbers, not forecasts. Tokenized stocks give price exposure only. Not available to US persons or restricted regions.
        </p>
      </aside>
      <div className="app-body">
        <header className="app-header">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6 md:h-16">
            <div className="flex min-w-0 items-center gap-1">
              <BackButton />
              <Logo className="xl:hidden" />
            </div>
            <nav className="flex min-w-0 items-center gap-1.5">
              <NavLinks />
              <InstallButton />
              <div className="md:ml-2">
                <ConnectButton variant="app" />
              </div>
            </nav>
          </div>
        </header>
        <NavTracker />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-6 md:pb-20 sm:px-6 sm:pt-10">
          <InstallBanner />
          {children}
        </main>
        <footer className="border-t border-[var(--line)] pb-24 md:pb-0">
          <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 sm:flex-row sm:items-end sm:justify-between sm:px-6">
            <div className="space-y-2">
              <div className="app-logo text-[17px] text-muted">nearbags</div>
              <p className="fine max-w-xl">
                Historical numbers, not forecasts. Tokenized stocks give price exposure only. Not available to US persons or restricted regions.
              </p>
            </div>
            <nav className="flex flex-wrap gap-0.5">
              <Link href="/explore" className="app-nav-link">Explore</Link>
              <Link href="/thesis" className="app-nav-link">Thesis</Link>
              <Link href="/docs" className="app-nav-link">Docs</Link>
              <a href="https://github.com/prakhar728/stonkbag" target="_blank" rel="noopener" className="app-nav-link">GitHub</a>
              <Link href="/terms" className="app-nav-link">Terms</Link>
              <Link href="/risk" className="app-nav-link">Risks</Link>
            </nav>
          </div>
        </footer>
      </div>
      <MobileTabs />
    </div>
  );
}
