// Fonts for share images (next/og needs TTF/OTF data, not the woff2 that next/font serves). Same families as the app:
// Anybody for display, JetBrains Mono for figures. Fetched once per server instance.
import "server-only";

type Font = { name: string; data: ArrayBuffer; weight: 400 | 500 | 700 | 800; style: "normal" };
let cache: Promise<Font[]> | null = null;

async function ttf(family: string, weight: number): Promise<ArrayBuffer> {
  const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${family}:wght@${weight}`, { cache: "force-cache" })).text();
  const url = css.match(/src: url\((.+?\.ttf)\)/)?.[1];
  if (!url) throw new Error(`No TTF for ${family} ${weight}`);
  return (await fetch(url, { cache: "force-cache" })).arrayBuffer();
}

export function shareFonts(): Promise<Font[]> {
  cache ??= Promise.all([
    ttf("Anybody", 800).then((data) => ({ name: "Anybody", data, weight: 800 as const, style: "normal" as const })),
    ttf("JetBrains+Mono", 500).then((data) => ({ name: "JetBrains Mono", data, weight: 500 as const, style: "normal" as const })),
    ttf("JetBrains+Mono", 800).then((data) => ({ name: "JetBrains Mono", data, weight: 800 as const, style: "normal" as const })),
  ]).catch((e) => {
    cache = null; // try again on the next image
    throw e;
  });
  return cache;
}
