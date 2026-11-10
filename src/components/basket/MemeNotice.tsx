// The meme-coin risk notice: on meme baskets, in the creator studio and in the buy preview.
export function MemeNotice({ compact = false }: { compact?: boolean }) {
  return (
    <div className="callout callout-warn space-y-1.5" role="note">
      <p className="font-medium text-text">Meme coins: high risk, thin liquidity, ~1–1.5% cost per swap.</p>
      {!compact && (
        <p className="text-sm">
          HOOT and NEARLY trade on Rhea, a NEAR exchange, not through NEAR Intents. Each pool holds about $100k, so prices can move 5–10% in minutes and
          halve in weeks (NEARLY is down about 80% from its peak). Every buy and sell pays the pool&rsquo;s 1% fee plus price impact. HOOT&rsquo;s contract can
          be upgraded by its team: if it ever adds a transfer fee or changes code, buying pauses here and selling stays open.
        </p>
      )}
    </div>
  );
}
