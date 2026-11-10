// PNG icons for the web app manifest, rendered once at build: /pwa/icon-192.png, /pwa/icon-512.png,
// /pwa/maskable-512.png (art inside the safe zone so Android's round masks don't clip it).
import { ImageResponse } from "next/og";
import { IconArt } from "@/lib/pwa/icon";

// "any" icons are the rounded tile as drawn; the maskable one is a full-bleed square with the bag inside the safe zone.
const FILES: Record<string, { size: number; pad: number; rounded: boolean }> = {
  "icon-192.png": { size: 192, pad: 0, rounded: true },
  "icon-512.png": { size: 512, pad: 0, rounded: true },
  "maskable-512.png": { size: 512, pad: 0.14, rounded: false },
};

export function generateStaticParams() {
  return Object.keys(FILES).map((file) => ({ file }));
}

export async function GET(_req: Request, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params;
  const f = FILES[file];
  if (!f) return new Response("Not found", { status: 404 });
  return new ImageResponse(<IconArt size={f.size} pad={f.pad} rounded={f.rounded} />, {
    width: f.size,
    height: f.size,
    headers: { "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800" },
  });
}
