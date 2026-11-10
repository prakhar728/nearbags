// The app icon: a white shopping bag on near-black whose handle is a green up-arrow. One drawing for every size,
// rendered to PNG by next/og (favicon, Apple touch icon, the manifest's icons). `pad` shrinks the art for maskable
// icons, whose outer 10% Android may crop to a circle or squircle.
export const ICON_BG = "#171717";
export const ICON_FG = "#00ec97";
export const ICON_BAG = "#ffffff";

/** The bag drawing on a 48-unit grid; the logo uses the same paths. */
export const BAG_PATH = "M11 18h26l-2.2 21a3 3 0 0 1-3 2.7H16.2a3 3 0 0 1-3-2.7z";
export const HANDLE_PATH = "M18 18l6-7 6 7";

export function IconArt({ size, pad = 0 }: { size: number; pad?: number }) {
  const inner = size * (1 - 2 * pad) * 0.78;
  return (
    <div style={{ width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center", background: ICON_BG }}>
      <svg width={inner} height={inner} viewBox="6 6 36 38">
        <path d={BAG_PATH} fill={ICON_BAG} />
        <path d={HANDLE_PATH} fill="none" stroke={ICON_FG} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
