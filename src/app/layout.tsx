import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const jetbrains = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Stonkbag",
  description: "Creator-made baskets of tokenized stocks and crypto. Buy the whole bag from any chain, keep your own keys.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrains.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-bg text-text">
        <header className="border-b border-border">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
            <Link href="/" className="font-mono text-sm font-semibold tracking-[0.2em]">
              STONKBAG
            </Link>
            <nav className="flex items-center gap-6 font-mono text-xs text-muted">
              <Link href="/" className="hover:text-text">EXPLORE</Link>
              <Link href="/create" className="hover:text-text">CREATE</Link>
              <Link href="/portfolio" className="hover:text-text">PORTFOLIO</Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
        <footer className="border-t border-border">
          <div className="mx-auto max-w-6xl px-4 py-6 font-mono text-[11px] leading-relaxed text-faint">
            Historical numbers, not forecasts. Tokenized stocks give price exposure only. Not available to US persons or restricted regions.
          </div>
        </footer>
      </body>
    </html>
  );
}
