// An asset's logo (public/logos/<ID>.png, from CoinGecko via scripts/fetch-logos.mjs). Decorative: the ticker is
// always written next to it, so the image has empty alt text.
import Image from "next/image";

export function AssetLogo({ id, size = 16, className = "" }: { id: string; size?: number; className?: string }) {
  return (
    <Image
      src={`/logos/${id}.png`}
      alt=""
      width={size}
      height={size}
      className={`shrink-0 rounded-full bg-white/5 object-cover ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

/** Logo + ticker, for chips and table cells. */
export function AssetTag({ id, size = 16, className = "" }: { id: string; size?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <AssetLogo id={id} size={size} />
      <span>{id}</span>
    </span>
  );
}
