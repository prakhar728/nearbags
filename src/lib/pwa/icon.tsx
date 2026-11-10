// The app icon: an acid-yellow bag with a rising line on black. One drawing for every size, rendered to PNG by
// next/og (favicon, Apple touch icon, the manifest's icons). `pad` shrinks the art for maskable icons, whose outer
// 10% Android may crop to a circle or squircle.
export const ICON_BG = "#0a0a0a";
export const ICON_FG = "#e8ff59";

export function IconArt({ size, pad = 0 }: { size: number; pad?: number }) {
  const inner = size * (1 - 2 * pad);
  return (
    <div style={{ width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center", background: ICON_BG }}>
      <svg width={inner} height={inner} viewBox="0 0 512 512">
        {/* handle (drawn first; its ends tuck behind the bag) */}
        <path d="M206 236 V176 a50 50 0 0 1 100 0 V236" fill="none" stroke={ICON_FG} strokeWidth="22" strokeLinecap="round" />
        {/* bag: a little wider at the bottom, like a shopping bag */}
        <path d="M150 204 H362 L392 418 H120 Z" fill={ICON_FG} stroke={ICON_FG} strokeWidth="28" strokeLinejoin="round" />
        {/* rising line with an arrow head */}
        <path d="M168 376 L226 326 L266 352 L334 288" fill="none" stroke={ICON_BG} strokeWidth="26" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M294 284 L338 284 L338 328" fill="none" stroke={ICON_BG} strokeWidth="26" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
