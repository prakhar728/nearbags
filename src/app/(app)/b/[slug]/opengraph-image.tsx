// Link preview for a basket page (X, Telegram, Slack…): name, weights, backtest line and stat.
import { ImageResponse } from "next/og";
import { BasketCard, SIZE } from "@/lib/share/cards";
import { basketCardData } from "@/lib/share/data";
import { shareFonts } from "@/lib/share/fonts";

export const size = SIZE;
export const contentType = "image/png";
export const alt = "A Stonkbag basket";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const b = await basketCardData(slug);
  const fonts = await shareFonts().catch(() => undefined);
  if (!b) {
    return new ImageResponse(
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0a0a", color: "#e8ff59", fontSize: 64 }}>STONKBAG</div>,
      { ...SIZE, fonts },
    );
  }
  return new ImageResponse(<BasketCard b={b} />, { ...SIZE, fonts });
}
