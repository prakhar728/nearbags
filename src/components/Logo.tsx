// Stonkbag's mark (the bag with a rising line, same drawing as the app icon) and wordmark, for headers and footers.
import Link from "next/link";
import { ICON_FG } from "@/lib/pwa/icon";

export function BagMark({ size = 18, color = ICON_FG, line = "#171717" }: { size?: number; color?: string; line?: string }) {
  return (
    <svg width={size} height={size} viewBox="96 120 320 320" aria-hidden>
      <path d="M206 236 V176 a50 50 0 0 1 100 0 V236" fill="none" stroke={color} strokeWidth="26" strokeLinecap="round" />
      <path d="M150 204 H362 L392 418 H120 Z" fill={color} stroke={color} strokeWidth="28" strokeLinejoin="round" />
      <path d="M168 376 L226 326 L266 352 L334 288" fill="none" stroke={line} strokeWidth="28" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M294 284 L338 284 L338 328" fill="none" stroke={line} strokeWidth="28" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Mark in a dark tile + STONKBAG wordmark. */
export function Logo({ href = "/", className = "", size = "md" }: { href?: string; className?: string; size?: "md" | "lg" }) {
  const lg = size === "lg";
  return (
    <Link href={href} className={`app-logo shrink-0 ${lg ? "text-[18px]" : ""} ${className}`} aria-label="Stonkbag home">
      <span className="app-logo-mark" style={lg ? { width: 36, height: 36, borderRadius: 10 } : undefined}>
        <BagMark size={lg ? 24 : 20} line="#171717" />
      </span>
      <span aria-hidden>STONKBAG</span>
    </Link>
  );
}
