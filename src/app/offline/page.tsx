// Shown by the service worker when the installed app opens with no connection.
import { RetryButton } from "./RetryButton";

export const metadata = { title: "Offline · Stonkbag" };

export default function Offline() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="app-logo text-[15px]">STONKBAG</div>
      <div className="grid gap-2">
        <h1 className="display text-[40px]">You&rsquo;re offline.</h1>
        <p className="max-w-xs text-[15px] leading-relaxed text-muted">Prices and balances need a connection. Your bags are safe on chain.</p>
      </div>
      <RetryButton />
    </main>
  );
}
