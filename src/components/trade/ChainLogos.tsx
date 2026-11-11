// Logos for pay tokens and networks. Most reuse public/logos; the few we have no file for are small inline marks.
/* eslint-disable @next/next/no-img-element */

const TOKEN_FILE: Record<string, string> = {
  ETH: "ETH", USDC: "USDC", BTC: "BTC", SOL: "SOL", wNEAR: "NEAR", NEAR: "NEAR", ZEC: "ZEC", XRP: "XRP", DOGE: "DOGE", SUI: "SUI", BNB: "BNB",
};
const CHAIN_FILE: Record<string, string> = {
  eth: "ETH", bsc: "BNB", near: "NEAR", sol: "SOL", btc: "BTC", zec: "ZEC", xrp: "XRP", doge: "DOGE", sui: "SUI",
};

const Disc = ({ size, bg, children }: { size: number; bg: string; children: React.ReactNode }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className="shrink-0 rounded-full">
    <circle cx="16" cy="16" r="16" fill={bg} />
    {children}
  </svg>
);

const MARKS: Record<string, (s: number) => React.ReactNode> = {
  USDT: (s) => (
    <Disc size={s} bg="#26A17B">
      <path d="M9 9.5h14v3.2h-5.3V23h-3.4V12.7H9z" fill="#fff" />
      <ellipse cx="16" cy="15.6" rx="7.6" ry="2.1" fill="none" stroke="#fff" strokeWidth="1.4" />
    </Disc>
  ),
  TRX: (s) => (
    <Disc size={s} bg="#EF0027">
      <path d="M8 9l17 3.4-8.4 11.6z M8 9l8.6 15 M25 12.4l-12.5 3.4" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
    </Disc>
  ),
  base: (s) => (
    <svg width={s} height={s} viewBox="0 0 32 32" aria-hidden className="shrink-0 rounded-full">
      <rect width="32" height="32" rx="16" fill="#fff" />
      <rect x="7" y="7" width="18" height="18" rx="3" fill="#0052FF" />
    </svg>
  ),
  arb: (s) => (
    <Disc size={s} bg="#213147">
      <path d="M11 23l5.2-14 5.8 14" fill="none" stroke="#28A0F0" strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M13.6 18.2h5" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
    </Disc>
  ),
  op: (s) => (
    <Disc size={s} bg="#FF0420">
      <text x="16" y="20.5" textAnchor="middle" fontFamily="system-ui, sans-serif" fontWeight="800" fontSize="12" fill="#fff">OP</text>
    </Disc>
  ),
  pol: (s) => (
    <Disc size={s} bg="#8247E5">
      <path d="M12.5 12.2l3.5-2 3.5 2v4l-3.5 2-3.5-2z M16 18.2v3.6 M19.5 16.2l3 1.7v3.6l-3 1.7-3-1.7" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinejoin="round" />
    </Disc>
  ),
};
MARKS.tron = MARKS.TRX;

function Img({ file, size }: { file: string; size: number }) {
  return <img src={`/logos/${file}.png`} alt="" width={size} height={size} className="shrink-0 rounded-full bg-white" style={{ width: size, height: size }} />;
}

function Fallback({ label, size }: { label: string; size: number }) {
  return (
    <span className="grid shrink-0 place-items-center rounded-full bg-[var(--surface-2)] text-[10px] font-semibold text-muted" style={{ width: size, height: size }}>
      {label.slice(0, 3)}
    </span>
  );
}

export function TokenLogo({ symbol, size = 28 }: { symbol: string; size?: number }) {
  if (TOKEN_FILE[symbol]) return <Img file={TOKEN_FILE[symbol]} size={size} />;
  if (MARKS[symbol]) return <>{MARKS[symbol](size)}</>;
  return <Fallback label={symbol} size={size} />;
}

export function ChainLogo({ chain, size = 28 }: { chain: string; size?: number }) {
  if (CHAIN_FILE[chain]) return <Img file={CHAIN_FILE[chain]} size={size} />;
  if (MARKS[chain]) return <>{MARKS[chain](size)}</>;
  return <Fallback label={chain} size={size} />;
}
