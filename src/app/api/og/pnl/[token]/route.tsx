// P&L share image from a signed snapshot token. Used as the share page's link preview and for "download image".
import { ImageResponse } from "next/og";
import { PnlCard, SIZE } from "@/lib/share/cards";
import { shareFonts } from "@/lib/share/fonts";
import { readSnapshot } from "@/lib/share/token";

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const s = await readSnapshot(token);
  if (!s) return new Response("Not found", { status: 404 });
  const fonts = await shareFonts().catch(() => undefined);
  const res = new ImageResponse(<PnlCard s={s} />, { ...SIZE, fonts, headers: { "Cache-Control": "public, max-age=31536000, immutable" } });
  if (new URL(request.url).searchParams.has("download")) {
    res.headers.set("Content-Disposition", `attachment; filename="stonkbag-${s.slug}-pnl.png"`);
  }
  return res;
}
