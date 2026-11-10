import { PageHeader } from "@/components/ui/Primitives";
import { ATTESTATION_TEXT } from "@/lib/compliance";

export const metadata = { title: "Risks · nearbags" };

const RISKS: [string, string][] = [
  ["Price exposure only", "Ondo stock tokens track a share's price and reinvested dividends. You get no voting rights and no direct claim on the company."],
  ["Issuer risk", "If Ondo Global Markets fails or stops redeeming, the tokens can lose value regardless of the stock."],
  ["Off-hours prices", "Tokens trade when US markets are closed. Prices then can drift from where the stock opens."],
  ["Thin liquidity", "Some assets have small trading volume. Swaps below a minimum size can't fill, and large ones cost more."],
  ["Crypto volatility", "Crypto assets in a basket can fall more than 50% in weeks."],
  ["Backtests", "Historical returns use past prices. Baskets are picked with hindsight, so backtests look better than the future usually does."],
  ["Self-custody", "You hold the keys. Lose your wallet and nobody can restore the funds."],
  ["Software risk", "NEAR Intents, 1Click, bridges and this app can have bugs or outages."],
];

export default function Risk() {
  return (
    <article className="grid max-w-3xl gap-10">
      <PageHeader kicker="Read this first" title="Risks" />
      <dl className="grid gap-3">
        {RISKS.map(([k, v]) => (
          <div key={k} className="card grid gap-2 p-5">
            <dt className="label text-muted">{k}</dt>
            <dd className="text-[15px] leading-relaxed text-muted">{v}</dd>
          </div>
        ))}
      </dl>
      <section className="card card-ticks grid gap-3 p-6">
        <h2 className="label">What you confirm before your first buy</h2>
        <p className="text-[15px] leading-relaxed text-muted">{ATTESTATION_TEXT.risk}</p>
      </section>
    </article>
  );
}
