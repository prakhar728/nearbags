// The nearbags mark: a white shopping bag on a near-black rounded tile, with NEAR's logo (unaltered) as the bag's
// label. One drawing for every size. IconArt renders it with next/og (favicon, Apple touch icon, the manifest's
// icons, share cards); src/components/Logo.tsx draws the same geometry in the page.
//
// Geometry lives on a 1254-unit grid; the tile is the square VIEWBOX inside it.
import { NEAR_LOGO_DATA_URI } from "./near-logo";

export const ICON_BG = "#171717";
export const ICON_BAG = "#ffffff";

export const VIEWBOX = "110 110 1034 1034";
const VIEW_MIN = 110;
const VIEW_SIZE = 1034;

export const BAG_PATH = "M370 412H884Q930 412 933 458L990 958Q995 1017 936 1017H318Q259 1017 264 958L321 458Q324 412 370 412Z";
export const HANDLE_PATH = "M479 420V372A147.5 147.5 0 0 1 774 372V420";
export const HANDLE_STROKE = 46;
/** NEAR's logo sits here on the grid, clipped to a rounded square. */
export const LABEL = { x: 437, y: 536, size: 380, rx: 36 } as const;
/** Tile corner radius as a share of the tile's side. */
export const TILE_RADIUS = 0.22;

/** Label box in pixels for a tile `size` px wide, offset by `off` px. */
export function labelBox(size: number, off = 0) {
  const u = size / VIEW_SIZE;
  return { left: off + (LABEL.x - VIEW_MIN) * u, top: off + (LABEL.y - VIEW_MIN) * u, size: LABEL.size * u, radius: LABEL.rx * u };
}

/**
 * The mark as a next/og element. `pad` shrinks the art inside a full-bleed tile (maskable icons, whose outer edge
 * Android may crop to a circle); `rounded` gives the tile its own corners (favicon, "any" PWA icons, share cards).
 * Satori draws the label as an <img> with a border radius rather than an SVG clip path.
 */
export function IconArt({ size, pad = 0, rounded = false }: { size: number; pad?: number; rounded?: boolean }) {
  const art = size * (1 - 2 * pad);
  const off = size * pad;
  const l = labelBox(art, off);
  return (
    <div style={{ width: size, height: size, display: "flex", position: "relative", background: ICON_BG, borderRadius: rounded ? size * TILE_RADIUS : 0 }}>
      <svg width={art} height={art} viewBox={VIEWBOX} style={{ position: "absolute", left: off, top: off }}>
        <path d={BAG_PATH} fill={ICON_BAG} />
        <path d={HANDLE_PATH} fill="none" stroke={ICON_BAG} strokeWidth={HANDLE_STROKE} />
      </svg>
      {/* eslint-disable-next-line @next/next/no-img-element -- next/og renders plain <img>, not next/image */}
      <img
        src={NEAR_LOGO_DATA_URI}
        alt=""
        width={l.size}
        height={l.size}
        style={{ position: "absolute", left: l.left, top: l.top, width: l.size, height: l.size, borderRadius: l.radius }}
      />
    </div>
  );
}
