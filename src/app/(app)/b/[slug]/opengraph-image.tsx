// Link preview for a basket page (X, Telegram, Slack…): name, weights, backtest line and stat.
import { ImageResponse } from "next/og";
import { IconArt } from "@/lib/pwa/icon";
import { BasketCard, SIZE } from "@/lib/share/cards";
import { basketCardData } from "@/lib/share/data";
import { shareFonts } from "@/lib/share/fonts";

export const size = SIZE;
export const contentType = "image/png";
export const alt = "A nearbags basket";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const b = await basketCardData(slug);
  const fonts = await shareFonts().catch(() => undefined);
  if (!b) {
    return new ImageResponse(
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 28, background: "#171717", color: "#f2f2f2", fontSize: 88, fontFamily: "Familjen Grotesk", fontWeight: 700, letterSpacing: -3.5 }}>
        <IconArt size={104} rounded />
        nearbags
      </div>,
      { ...SIZE, fonts },
    );
  }
  return new ImageResponse(<BasketCard b={b} />, { ...SIZE, fonts });
}
