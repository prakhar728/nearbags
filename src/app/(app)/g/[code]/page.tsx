// A gift's claim page (plan feature 2). Anyone with the link sees the bag, the sender and the message; the claim
// itself runs in the browser with the key from the link's # (ClaimPanel). The amount shows only after signing in.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { AssetLogo } from "@/components/AssetLogo";
import { Card, PageHeader } from "@/components/ui/Primitives";
import { getAsset } from "@/lib/assets";
import { getSession, HttpError } from "@/lib/auth/session";
import { giftView } from "@/lib/gifts";
import { ClaimPanel } from "./ClaimPanel";

export const instant = false;
export const metadata: Metadata = { title: "A gift for you · nearbags", robots: { index: false } };

export default async function GiftPage({ params }: PageProps<"/g/[code]">) {
  const { code } = await params;
  await connection();
  // The viewer only decides the heading here (the sender sees "Your gift"); amounts load in ClaimPanel after sign-in.
  const s = await getSession();
  const g = await giftView(code, s?.userId ?? null).catch((e) => {
    if (e instanceof HttpError && e.status === 404) return null;
    throw e;
  });
  if (!g) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <PageHeader
        kicker={g.isSender ? "A gift you sent" : "A gift"}
        title={
          g.isSender ? (
            <>
              Your gift: <em>{g.basket.name}.</em>
            </>
          ) : (
            <>
              {g.sender} sent you <em>{g.basket.name}.</em>
            </>
          )
        }
        description={g.basket.tagline}
      />
      {g.message && (
        <Card>
          <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{g.message}</p>
          <p className="mt-2 text-xs text-faint">From {g.isSender ? "you" : g.sender}</p>
        </Card>
      )}
      <Card className="space-y-3">
        <div className="label">What&apos;s in it</div>
        <div className="flex flex-wrap gap-2">
          {g.basket.assets.map((a) => (
            <span key={a.assetId} className="chip gap-1.5 pl-1.5">
              <AssetLogo id={a.assetId} size={18} />
              {a.assetId} <span className="text-faint">{a.weightBps / 100}%</span>
              <span className="sr-only">{getAsset(a.assetId).name}</span>
            </span>
          ))}
        </div>
        <Link href={`/b/${g.basket.slug}`} className="text-sm underline underline-offset-2 hover:text-text">
          About this bag
        </Link>
      </Card>
      {g.isSender && (g.status === "ready" || g.status === "expired") && (
        <p className="fine">
          Until you take it back, the link works like cash. The expiry date and region checks are nearbags&apos; rules: anyone holding the link could still move
          the gift on intents.near directly. Taking it back from your portfolio also switches the link&apos;s key off.
        </p>
      )}
      <ClaimPanel code={g.code} accountId={g.accountId} status={g.status} expiresAt={g.expiresAt} basketId={g.basket.id} agentManaged={g.basket.agentManaged} />
    </div>
  );
}
