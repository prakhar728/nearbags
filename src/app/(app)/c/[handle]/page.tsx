// Creator profile (spec §5.8): handle, bio, optional X link (unverified), all baskets with live return, TVL, holders.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { BasketCard } from "@/components/basket/BasketCard";
import { CardGridSkeleton } from "@/components/basket/Skeletons";
import { Label } from "@/components/basket/Pairs";
import { getSession } from "@/lib/auth/session";
import { getCreatorProfile, listPendingByCreator, type CreatorProfile } from "@/lib/basket-pages";
import { cardData } from "@/lib/cards";
import { shortAddr } from "@/lib/format";

// Awaits params outside Suspense so an unknown handle gets a real 404 status. The profile read is cached.
export const instant = false;

export async function generateMetadata({ params }: PageProps<"/c/[handle]">): Promise<Metadata> {
  const { handle } = await params;
  const p = await getCreatorProfile(decodeURIComponent(handle));
  return { title: p ? `${p.handle ? "@" + p.handle : shortAddr(p.address)} · Stonkbag` : "Not found · Stonkbag", description: p?.bio ?? undefined };
}

export default async function ProfilePage({ params }: PageProps<"/c/[handle]">) {
  const { handle } = await params;
  const p = await getCreatorProfile(decodeURIComponent(handle));
  if (!p) notFound();

  return (
    <div className="space-y-10">
      <div className="space-y-3">
        <h1 className="num text-2xl font-semibold sm:text-3xl">{p.handle ? `@${p.handle}` : shortAddr(p.address)}</h1>
        {p.bio && <p className="max-w-xl text-sm leading-relaxed text-muted">{p.bio}</p>}
        <div className="num flex flex-wrap gap-x-4 gap-y-1 text-xs text-faint">
          <span className="break-all">{p.address}</span>
          {p.xUrl && (
            <a href={p.xUrl} target="_blank" rel="noopener noreferrer nofollow" className="text-muted hover:text-text">
              {p.xUrl.replace("https://", "")} <span className="text-faint">(unverified)</span>
            </a>
          )}
        </div>
        <Suspense fallback={null}>
          <OwnerBits p={p} />
        </Suspense>
      </div>

      <section className="space-y-4">
        <Label>Baskets · {p.baskets.length}</Label>
        {p.baskets.length ? (
          <Suspense fallback={<CardGridSkeleton count={p.baskets.length} />}>
            <Cards p={p} />
          </Suspense>
        ) : (
          <p className="text-sm text-muted">No live baskets yet.</p>
        )}
      </section>
    </div>
  );
}

async function Cards({ p }: { p: CreatorProfile }) {
  await connection();
  const cards = await cardData(p.baskets);
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {cards.map((c) => (
        <BasketCard key={c.basket.id} {...c} />
      ))}
    </div>
  );
}

/** Only the profile's owner sees pending baskets and the edit link. */
async function OwnerBits({ p }: { p: CreatorProfile }) {
  const s = await getSession();
  if (!s || s.userId !== p.id) return null;
  const pending = await listPendingByCreator(p.id);
  return (
    <div className="space-y-3 pt-2">
      <Link href="/profile" className="inline-block border border-border px-3 py-1.5 font-mono text-xs hover:border-border-strong">
        Edit profile
      </Link>
      {pending.length > 0 && (
        <div className="border border-border-strong p-4">
          <Label>Waiting for your self-buy</Label>
          <ul className="mt-2 space-y-1 text-sm">
            {pending.map((b) => (
              <li key={b.slug}>
                <Link href={`/b/${b.slug}`} className="hover:text-accent">
                  {b.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
