import Link from "next/link";
import { ConnectButton } from "@/components/ConnectButton";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link href="/" className="font-mono text-sm font-semibold tracking-[0.2em]">
            STONKBAG
          </Link>
          <nav className="flex items-center gap-4 font-mono text-xs text-muted sm:gap-6">
            <Link href="/explore" className="hidden hover:text-text sm:inline">EXPLORE</Link>
            <Link href="/create" className="hover:text-text">CREATE</Link>
            <Link href="/portfolio" className="hover:text-text">PORTFOLIO</Link>
            <Link href="/thesis" className="hidden hover:text-text sm:inline">THESIS</Link>
            <ConnectButton />
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
      <footer className="border-t border-border">
        <div className="mx-auto max-w-6xl px-4 py-6 font-mono text-[11px] leading-relaxed text-faint">
          Historical numbers, not forecasts. Tokenized stocks give price exposure only. Not available to US persons or restricted regions.{" "}
          <Link href="/terms" className="underline decoration-border-strong underline-offset-2 hover:text-muted">Terms</Link> ·{" "}
          <Link href="/risk" className="underline decoration-border-strong underline-offset-2 hover:text-muted">Risks</Link>
        </div>
      </footer>
    </>
  );
}
