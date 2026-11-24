// Explore → Creators: the leaderboard table (see lib/leaderboard for how it ranks).
import Link from "next/link";
import { CreatorAvatar } from "@/components/CreatorAvatar";
import { creatorHref, creatorName, pct, tone, usd } from "@/lib/format";
import type { CreatorRow } from "@/lib/leaderboard";

export function CreatorBoard({ rows }: { rows: CreatorRow[] }) {
  return (
    <div className="tbl-wrap">
      <table className="tbl sm:min-w-[720px]">
        <thead>
          <tr>
            <th className="w-12">#</th>
            <th>Creator</th>
            <th className="r hidden sm:table-cell">Bags</th>
            <th className="r">Buyers</th>
            <th className="r">Held</th>
            <th className="r hidden sm:table-cell">Traded 30d</th>
            <th className="hidden sm:table-cell">Best bag, live</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.creator.id}>
              <td className={`num font-medium ${r.rank <= 3 ? "text-text" : "text-muted"}`}>{r.rank}</td>
              <td>
                <Link href={creatorHref(r.creator)} className="flex min-w-0 items-center gap-2.5 font-medium hover:underline">
                  <CreatorAvatar address={r.creator.address} size={28} />
                  <span className="truncate">{creatorName(r.creator)}</span>
                </Link>
                {/* Phones: the best bag sits under the name instead of in its own column. */}
                {r.best && (
                  <Link href={`/b/${r.best.slug}`} className="mt-1 ml-[38px] flex items-baseline gap-1.5 text-[12.5px] text-muted sm:hidden">
                    <span className="truncate">{r.best.name}</span>
                    <span className={`num ${tone(r.best.live)}`}>{pct(r.best.live)}</span>
                  </Link>
                )}
              </td>
              <td className="r num hidden sm:table-cell">{r.bags}</td>
              <td className="r num font-medium">{r.buyers}</td>
              <td className="r num">{usd(r.heldUsd, { compact: true })}</td>
              <td className="r num hidden sm:table-cell">{usd(r.volume30dUsd, { compact: true })}</td>
              <td className="hidden sm:table-cell">
                {r.best ? (
                  <Link href={`/b/${r.best.slug}`} className="flex items-baseline gap-2 hover:underline">
                    <span className="truncate">{r.best.name}</span>
                    <span className={`num text-[13px] ${tone(r.best.live)}`}>{pct(r.best.live)}</span>
                  </Link>
                ) : (
                  <span className="text-faint">Under a week live</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
