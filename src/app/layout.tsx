import type { Metadata } from "next";
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
