import type { Metadata, Viewport } from "next";
import { Familjen_Grotesk, Figtree, JetBrains_Mono } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

// Figtree (open licence, the face near.com uses) for everything; JetBrains Mono only for code and addresses.
const figtree = Figtree({ variable: "--font-figtree", subsets: ["latin"] });
const jetbrains = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"] });
// Familjen Grotesk, kept for the stonkbag wordmark only; everything else is Figtree.
const familjen = Familjen_Grotesk({ variable: "--font-familjen", subsets: ["latin"], weight: ["600", "700"] });

export const metadata: Metadata = {
  title: "Stonkbag",
  description: "Creator-made baskets of tokenized stocks and crypto. Buy the whole bag from any chain, keep your own keys.",
  applicationName: "Stonkbag",
  // Installed on iPhone: full screen under a light status bar (dark clock on the white header).
  appleWebApp: { capable: true, title: "Stonkbag", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // lets the layout use env(safe-area-inset-*) around the notch and home bar
  themeColor: "#ffffff",
  colorScheme: "light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${figtree.variable} ${jetbrains.variable} ${familjen.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-bg text-text">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
