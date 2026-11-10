// The nearbags mark (a white bag on a dark tile with NEAR's logo as its label, same drawing as the app icon) and
// the lowercase wordmark. The label is an HTML <img> over the SVG, not an SVG clip path: clip-path ids would repeat
// across the several logos on a page and break when the first one is hidden.
import Link from "next/link";
import { BAG_PATH, HANDLE_PATH, HANDLE_STROKE, ICON_BAG, TILE_RADIUS, VIEWBOX, labelBox } from "@/lib/pwa/icon";

export function BagMark({ size = 30, className = "" }: { size?: number; className?: string }) {
  const l = labelBox(size);
  return (
    <span className={`bag-mark ${className}`} style={{ width: size, height: size, borderRadius: Math.round(size * TILE_RADIUS) }} aria-hidden>
      <svg width={size} height={size} viewBox={VIEWBOX}>
        <path d={BAG_PATH} fill={ICON_BAG} />
        <path d={HANDLE_PATH} fill="none" stroke={ICON_BAG} strokeWidth={HANDLE_STROKE} />
      </svg>
      {/* eslint-disable-next-line @next/next/no-img-element -- a 6 KB static PNG; the image optimizer adds nothing here */}
      <img src="/brand/near-logo.png" alt="" style={{ left: l.left, top: l.top, width: l.size, height: l.size, borderRadius: l.radius }} />
    </span>
  );
}

/** The mark + "nearbags" wordmark. */
export function Logo({ href = "/", className = "", size = "md" }: { href?: string; className?: string; size?: "md" | "lg" }) {
  const lg = size === "lg";
  return (
    <Link href={href} className={`app-logo shrink-0 ${lg ? "text-[24px]" : ""} ${className}`} aria-label="nearbags home">
      <BagMark size={lg ? 36 : 30} className="app-logo-mark" />
      <span aria-hidden>nearbags</span>
    </Link>
  );
}
