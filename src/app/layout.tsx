import type { Metadata, Viewport } from "next";
import { Anybody, Inter, JetBrains_Mono } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const jetbrains = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"] });
// Variable width (50–150) display face: the landing animates its width.
const anybody = Anybody({ variable: "--font-anybody", subsets: ["latin"], axes: ["wdth"] });

export const metadata: Metadata = {
  title: "Stonkbag",
  description: "Creator-made baskets of tokenized stocks and crypto. Buy the whole bag from any chain, keep your own keys.",
  applicationName: "Stonkbag",
  // Installed on iPhone: full screen, content runs under the status bar (the header pads for it).
  appleWebApp: { capable: true, title: "Stonkbag", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // lets the layout use env(safe-area-inset-*) around the notch and home bar
  themeColor: "#0a0a0a",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrains.variable} ${anybody.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-bg text-text">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
