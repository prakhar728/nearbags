import { PageHeader } from "@/components/ui/Primitives";
export const metadata = { title: "Terms · Stonkbag" };

const SECTIONS: [string, string[]][] = [
  ["What Stonkbag is", [
    "Stonkbag is software. It helps you buy a basket of tokens in one go through NEAR Intents and 1Click, and shows research written by basket creators.",
    "Stonkbag is not a broker, an exchange, an investment adviser or a fund. It never holds your funds.",
  ]],
  ["Your keys, your funds", [
    "Each basket you buy sits in its own NEAR Intents account. Its key is created in your browser, and your wallet is added as a recovery key. Stonkbag's servers never see either.",
    "If you lose access to your wallet, Stonkbag cannot recover your funds.",
  ]],
  ["Creators and research", [
    "Creators write their own theses. They are opinions, not advice, and Stonkbag doesn't check them. Creators set their own fee (0–1% of each buy), paid on-chain when you buy.",
    "Backtests show what a basket would have done in the past. They are not forecasts.",
  ]],
  ["Who can use Stonkbag", [
    "Tokenized stocks are issued by Ondo Global Markets (BVI) Limited and are not available to US persons, people in Canada, or people in other countries Ondo prohibits. In countries Ondo restricts, only professional or qualified investors may buy them.",
    "Nobody in a sanctioned country or region may use Stonkbag.",
  ]],
  ["Fees", ["On each buy: the creator's fee, a platform fee (currently 0.25%), and the swap cost from 1Click solvers. Selling has no Stonkbag fee."]],
  ["No warranty", ["Stonkbag is provided as is, without warranties. Smart contracts, bridges, solvers, price feeds and token issuers can fail. Use amounts you can afford to lose."]],
];

export default function Terms() {
  return (
    <article className="grid max-w-3xl gap-10">
      <PageHeader kicker="The fine print" title="Terms" />
      {SECTIONS.map(([h, ps]) => (
        <section key={h} className="card grid gap-3 p-5 sm:p-6">
          <h2 className="label text-muted">{h}</h2>
          {ps.map((p) => (
            <p key={p.slice(0, 20)} className="text-[15px] leading-relaxed text-muted">{p}</p>
          ))}
        </section>
      ))}
      <p className="fine">Hackathon build, November 2026. Not legal advice.</p>
    </article>
  );
}
