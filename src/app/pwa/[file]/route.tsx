// PNG icons for the web app manifest, rendered once at build: /pwa/icon-192.png, /pwa/icon-512.png,
// /pwa/maskable-512.png (art inside the safe zone so Android's round masks don't clip it).
import { ImageResponse } from "next/og";
import { IconArt } from "@/lib/pwa/icon";

const FILES: Record<string, { size: number; pad: number }> = {
  "icon-192.png": { size: 192, pad: 0.06 },
  "icon-512.png": { size: 512, pad: 0.06 },
  "maskable-512.png": { size: 512, pad: 0.16 },
};

export function generateStaticParams() {
  return Object.keys(FILES).map((file) => ({ file }));
}

export async function GET(_req: Request, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params;
  const f = FILES[file];
  if (!f) return new Response("Not found", { status: 404 });
  return new ImageResponse(<IconArt size={f.size} pad={f.pad} />, {
    width: f.size,
    height: f.size,
    headers: { "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800" },
  });
}
