// A wallet's picture: a mirrored 5×5 pattern and a hue, both from the address, so the same creator looks the same
// everywhere without uploads or a database column.
function fnv(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function CreatorAvatar({ address, size = 24, className = "" }: { address: string; size?: number; className?: string }) {
  const key = address.toLowerCase();
  const hue = fnv(key) % 360;
  let bits = fnv(`${key}#cells`);
  const cells: [number, number][] = [];
  for (let y = 0; y < 5; y++)
    for (let x = 0; x < 3; x++) {
      if (bits & 1) {
        cells.push([x, y]);
        if (x < 2) cells.push([4 - x, y]);
      }
      bits >>>= 1;
    }
  return (
    <svg
      width={size}
      height={size}
      viewBox="-1.5 -1.5 8 8"
      aria-hidden
      className={`shrink-0 rounded-full ring-1 ring-[var(--line)] ${className}`}
      style={{ background: `hsl(${hue} 70% 92%)` }}
    >
      {cells.map(([x, y]) => (
        <rect key={`${x}.${y}`} x={x} y={y} width="1.02" height="1.02" fill={`hsl(${hue} 55% 40%)`} />
      ))}
    </svg>
  );
}
