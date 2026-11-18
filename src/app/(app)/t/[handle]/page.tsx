// A creator's public treasury (plan feature 3): what it holds, every fee in, every purchase, and whether the cash it
// should have matches the cash it has. Live: read at request time from intents.near and the database.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { AssetLogo } from "@/components/AssetLogo";
import { Card, PageHeader, Section, Stat } from "@/components/ui/Primitives";
import { ASSETS, getAsset } from "@/lib/assets";
import { creatorHref, creatorName, usd } from "@/lib/format";
import { treasuryPage, type TreasuryPage } from "@/lib/treasury";

export const instant = false;

/** The handle from the URL, or null when its %-encoding is malformed (that's a 404, not a 500). */
function decodeHandle(raw: string): string | null {
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: PageProps<"/t/[handle]">): Promise<Metadata> {
  const { handle } = await params;
  const h = decodeHandle(handle);
  return { title: h ? `Treasury of ${h} · nearbags` : "Treasury · nearbags" };
}

const nameOf = (intentsId?: string) => ASSETS.find((a) => a.intentsAssetId === intentsId)?.id ?? "?";
const units = (intentsId: string | undefined, raw: string | undefined) => {
  const a = ASSETS.find((x) => x.intentsAssetId === intentsId);
  if (!a || !raw) return "";
  const n = Number(raw) / 10 ** a.decimals;
  return n.toLocaleString("en-US", { maximumSignificantDigits: 4 });
};
const KIND: Record<TreasuryPage["ledger"][number]["kind"], string> = { fee: "Fee received", topup: "Added by owner", gift: "Gift received", purchase: "Bought", sale: "Sold", out: "Paid out" };

export default async function TreasuryPublicPage({ params }: PageProps<"/t/[handle]">) {
  const { handle } = await params;
  await connection();
  const h = decodeHandle(handle);
  if (h == null) notFound();
  const t = await treasuryPage(h);
  if (!t) notFound();
  const gapOk = Math.abs(t.totals.gap) < 0.05;

  return (
    <div className="space-y-10">
      <PageHeader
        kicker="Treasury"
        title={
          <>
            {creatorName(t.owner)}&apos;s <em>treasury.</em>
          </>
        }
        description={
          <>
            Held as{" "}
            <Link href={`/b/${t.basket.slug}`} className="underline underline-offset-2 hover:text-text">
              {t.basket.name}
            </Link>
            . {t.routeFees ? "The creator fees from their bags come in here." : "Fees aren't routed here right now."} Only{" "}
            <Link href={creatorHref(t.owner)} className="underline underline-offset-2 hover:text-text">
              {creatorName(t.owner)}
            </Link>
            {t.spenders.agent ? " and the nearbags AI agent, inside the bag's limits," : ""} can move it.
          </>
        }
      />

      <Card className="grid grid-cols-2 gap-6 md:grid-cols-4">
        <Stat label="Value now" value={usd(t.valueUsd, { cents: true })} />
        <Stat label="Fees received" value={usd(t.totals.fees, { cents: true })} sub={t.totals.topups > 0 ? `+ ${usd(t.totals.topups, { cents: true })} added by owner` : undefined} />
        <Stat label="Spent on assets" value={usd(t.totals.spent, { cents: true })} />
        <Stat
          label="Largest holding"
          value={t.largest.assetId ? `${Math.round(t.largest.share * 100)}%` : "—"}
          sub={t.largest.assetId ? `${t.largest.assetId} of everything held` : "Nothing bought yet"}
        />
      </Card>

      <Section title="Holdings">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {t.holdings.map((h) => (
            <div key={h.assetId} className="card flex items-center gap-4 p-4">
              <AssetLogo id={h.assetId} size={36} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">
                  {h.assetId} <span className="font-normal text-muted">{getAsset(h.assetId).name}</span>
                </div>
                <div className="num text-xs text-faint">
                  {h.units.toLocaleString("en-US", { maximumSignificantDigits: 5 })} · {(h.weightNowBps / 100).toFixed(1)}% now
                  {h.targetBps > 0 ? ` · target ${h.targetBps / 100}%` : ""}
                </div>
              </div>
              <div className="num text-sm">{usd(h.valueUsd, { cents: true })}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Cash check">
        <Card className="space-y-3 text-sm">
          <Row k="Received" v={usd(t.totals.received, { cents: true })} />
          <Row k="Spent on assets" v={`− ${usd(t.totals.spent, { cents: true })}`} />
          {t.totals.sold > 0 && <Row k="From sales" v={`+ ${usd(t.totals.sold, { cents: true })}`} />}
          {t.totals.out > 0 && <Row k="Paid out and fees" v={`− ${usd(t.totals.out, { cents: true })}`} />}
          <div className="border-t border-[var(--line)] pt-3">
            <Row k="Cash it should hold" v={usd(t.totals.expectedCash, { cents: true })} />
            <Row k="Cash it holds (USDC)" v={usd(t.totals.cashNow, { cents: true })} />
          </div>
          <p className={`text-xs ${gapOk ? "text-muted" : "text-loss"}`}>
            {gapOk
              ? "These match."
              : `Off by ${usd(t.totals.gap, { cents: true })}. Usually a swap that's still settling or rounding on a refund. If it stays, it's worth asking the owner.`}
          </p>
        </Card>
      </Section>

      <Section title="Every movement">
        {t.ledger.length === 0 ? (
          <p className="text-sm text-muted">Nothing yet.</p>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="label text-left">
                  <th className="px-4 py-3 font-normal">When (UTC)</th>
                  <th className="px-4 py-3 font-normal">What</th>
                  <th className="px-4 py-3 text-right font-normal">USDC</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {t.ledger.map((e, i) => (
                  <tr key={i}>
                    <td className="num whitespace-nowrap px-4 py-2.5 text-xs text-faint">{e.at.slice(0, 16).replace("T", " ")}</td>
                    <td className="px-4 py-2.5">
                      {KIND[e.kind]}
                      {e.kind === "fee" && e.note && <span className="text-muted"> from a buy of {e.note}</span>}
                      {(e.kind === "purchase" || e.kind === "sale") && (
                        <span className="text-muted">
                          {" "}
                          {units(e.asset, e.units)} {nameOf(e.asset)}
                        </span>
                      )}
                      {e.kind === "out" && e.note && <span className="text-muted"> · {e.note}</span>}
                      {e.kind === "gift" && (
                        <span className="text-muted">
                          {/* "A gift": the public page never names who sent it. Only the owner's own take-back gets a note. */}
                          {e.note && e.note !== "A gift" ? ` (${e.note})` : ""}
                          {e.items?.length ? ` · ${e.items.map(([id, v]) => `${units(id, v)} ${nameOf(id)}`).join(", ")}` : ""}
                        </span>
                      )}
                    </td>
                    <td className={`num px-4 py-2.5 text-right ${e.usdc >= 0 ? "text-gain" : "text-muted"}`}>
                      {e.usdc >= 0 ? "+" : "−"}
                      {usd(Math.abs(e.usdc), { cents: true }).replace("$", "")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <p className="fine">
        Account <span className="num break-all">{t.accountId}</span> in NEAR Intents (intents.near). Values use reference prices. A treasury since {t.since.slice(0, 10)}.
      </p>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-muted">{k}</span>
      <span className="num">{v}</span>
    </div>
  );
}
