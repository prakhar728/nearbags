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
  return { title: p ? `${p.handle ? "@" + p.handle : shortAddr(p.address)} · nearbags` : "Not found · nearbags", description: p?.bio ?? undefined };
}

export default async function ProfilePage({ params }: PageProps<"/c/[handle]">) {
  const { handle } = await params;
  const p = await getCreatorProfile(decodeURIComponent(handle));
  if (!p) notFound();

  return (
    <div className="space-y-10">
      <div className="card card-pad relative overflow-hidden">
                <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="grid h-20 w-20 shrink-0 place-items-center rounded-[var(--r-lg)] bg-accent text-3xl font-semibold text-accent-ink">
            {(p.handle ?? p.address).slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 space-y-2">
            <div className="label">Creator</div>
            <h1 className="display truncate text-[clamp(32px,5vw,52px)]">{p.handle ? `@${p.handle}` : shortAddr(p.address)}</h1>
            {p.bio && <p className="max-w-xl text-[15px] leading-relaxed text-muted">{p.bio}</p>}
          </div>
        </div>
        <div className="relative mt-5 flex flex-wrap gap-1.5">
          <span className="chip max-w-full truncate">{p.address}</span>
          {p.xUrl && (
            <a href={p.xUrl} target="_blank" rel="noopener noreferrer nofollow" className="chip">
              {p.xUrl.replace("https://", "")} <span className="text-faint">(unverified)</span>
            </a>
          )}
        </div>
        <Suspense fallback={null}>
          <OwnerBits p={p} />
        </Suspense>
      </div>

      <section className="space-y-5">
        <Label>Baskets · {p.baskets.length}</Label>
        {p.baskets.length ? (
          <Suspense fallback={<CardGridSkeleton count={p.baskets.length} />}>
            <Cards p={p} />
          </Suspense>
        ) : (
          <div className="card p-6 text-sm text-muted">No live baskets yet.</div>
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
      {cards.map((c, i) => (
        <BasketCard key={c.basket.id} {...c} i={i} />
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
    <div className="relative space-y-3 pt-5">
      <Link href="/profile" className="btn btn-secondary btn-sm">
        Edit profile
      </Link>
      {pending.length > 0 && (
        <div className="well p-4">
          <Label>Waiting for your self-buy</Label>
          <ul className="mt-2 space-y-1 text-sm">
            {pending.map((b) => (
              <li key={b.slug}>
                <Link href={`/b/${b.slug}`} className="hover:text-accent-fg">
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
