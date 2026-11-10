// Stonkbag's mark (a bag whose handle is an up-arrow, same drawing as the app icon) and its lowercase wordmark.
import Link from "next/link";
import { BAG_PATH, HANDLE_PATH, ICON_BAG, ICON_FG } from "@/lib/pwa/icon";

export function BagMark({ size = 18, bag = ICON_BAG, handle = ICON_FG }: { size?: number; bag?: string; handle?: string }) {
  return (
    <svg width={size} height={size} viewBox="6 6 36 38" aria-hidden>
      <path d={BAG_PATH} fill={bag} />
      <path d={HANDLE_PATH} fill="none" stroke={handle} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Mark in a dark tile + "stonkbag" wordmark. */
export function Logo({ href = "/", className = "", size = "md" }: { href?: string; className?: string; size?: "md" | "lg" }) {
  const lg = size === "lg";
  return (
    <Link href={href} className={`app-logo shrink-0 ${lg ? "text-[24px]" : ""} ${className}`} aria-label="Stonkbag home">
      <span className="app-logo-mark" style={lg ? { width: 36, height: 36, borderRadius: 10 } : undefined}>
        <BagMark size={lg ? 24 : 20} />
      </span>
      <span aria-hidden>stonkbag</span>
    </Link>
  );
}
