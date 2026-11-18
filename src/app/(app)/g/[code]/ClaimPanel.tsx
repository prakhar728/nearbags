"use client";
// Claim a gift: sign in, pass the same checks as a buyer, then the gift's key (from this link's #) signs one transfer
// of everything in the gift into your own account for this bag.
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useAuth } from "@/lib/client/auth";
import { keyFromHash, moveGift, ownAccountFor, signWithKey } from "@/lib/client/gift";
import { usd } from "@/lib/format";

type Status = "funding" | "ready" | "claimed" | "reclaimed" | "cancelled" | "expired";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) }, cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? `Request failed (${r.status})`);
  return j as T;
}

// `accountId` only reaches the sender; anyone else's browser takes the gift's account from the key in the link.
export function ClaimPanel(p: { code: string; accountId: string | null; status: Status; expiresAt: string; basketId: number; agentManaged: boolean }) {
  const { user, keyForBasket, signInNear, busy: authBusy } = useAuth();
  // The key lives in the link's # (never sent to a server). null while rendering on the server.
  const hash = useSyncExternalStore(
    (cb) => {
      window.addEventListener("hashchange", cb);
      return () => window.removeEventListener("hashchange", cb);
    },
    () => window.location.hash,
    () => null,
  );
  const hasKey = hash == null ? null : Boolean(keyFromHash(hash, p.accountId));
  const [info, setInfo] = useState<{ valueUsd: number | null; isSender: boolean; status: Status } | null>(null);
  const [elig, setElig] = useState<{ status: "ok" | "needs" | "blocked"; needs: string[]; reason?: string; text: Record<string, string> } | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [step, setStep] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!user) return;
    let live = true;
    api<{ valueUsd: number | null; isSender: boolean; status: Status }>(`/api/gifts/${p.code}`).then((j) => live && setInfo(j)).catch(() => {});
    api<typeof elig>(`/api/eligibility?basketId=${p.basketId}`).then((j) => live && setElig(j)).catch(() => {});
    return () => {
      live = false;
    };
  }, [user, p.code, p.basketId]);

  const status = info?.status ?? p.status;
  const closed: Partial<Record<Status, string>> = {
    funding: "This gift is still being paid for. Check back in a few minutes.",
    claimed: "This gift has been claimed.",
    reclaimed: "The sender took this gift back.",
    cancelled: "The sender cancelled this gift before paying for it.",
    expired: "This gift expired on nearbags. It stays with the sender until they take it back.",
  };

  async function claim() {
    if (!user) return;
    const k = keyFromHash(window.location.hash, p.accountId);
    if (!k) return setErr("This link is missing its key. Ask the sender to copy the link again.");
    setErr(null);
    try {
      const own = await ownAccountFor(p.basketId, p.agentManaged, { keyForBasket, walletPubkey: user.walletPubkey, setStep });
      setStep("Moving the gift into your account…");
      await moveGift(p.code, "claim", k.accountId, own.accountId, signWithKey(k));
      setDone(true);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setStep(null);
    }
  }

  const box = (children: React.ReactNode) => <div className="card card-pad space-y-4">{children}</div>;

  if (done)
    return box(
      <>
        <p className="text-[15px] font-medium">It&apos;s yours.</p>
        <p className="text-sm text-muted">The bag is in your own account now. Only your browser key and your wallet can move it.</p>
        <Link href="/portfolio" className="btn btn-primary">
          See it in your portfolio
        </Link>
      </>,
    );
  if (closed[status]) return box(<p className="text-sm text-muted">{closed[status]}</p>);
  if (hasKey === false) return box(<p className="text-sm text-muted">This link is missing its key (the part after #). Ask the sender to copy the whole link again.</p>);
  if (!user)
    return box(
      <>
        <p className="text-sm text-muted">Connect a wallet to claim it. The bag goes into an account only your wallet controls.</p>
        <button type="button" className="btn btn-primary" onClick={() => void signInNear()} disabled={!!authBusy}>
          Connect a NEAR wallet
        </button>
        <p className="fine">Or use the Connect button at the top for an EVM wallet. Claim by {p.expiresAt.slice(0, 10)}.</p>
      </>,
    );
  if (info?.isSender) return box(<p className="text-sm text-muted">This is your own gift. Send the link to the person it&apos;s for, or take it back from your portfolio.</p>);
  if (elig?.status === "blocked") return box(<p className="text-sm text-muted">{elig.reason} The gift stays with the sender.</p>);

  const needs = elig?.status === "needs" ? elig.needs : [];
  const allChecked = needs.every((n) => checked[n]);
  return box(
    <>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[15px] font-medium">Claim your gift</span>
        {info?.valueUsd != null && <span className="big-num text-xl text-accent-fg">{usd(info.valueUsd, { cents: true })}</span>}
      </div>
      {needs.map((n) => (
        <label key={n} className="flex cursor-pointer gap-3 rounded-[var(--r-sm)] border border-[var(--line)] p-3 text-xs leading-relaxed text-muted">
          <input type="checkbox" className="check mt-0.5" checked={!!checked[n]} onChange={(e) => setChecked((c) => ({ ...c, [n]: e.target.checked }))} />
          <span>{elig?.text[n]}</span>
        </label>
      ))}
      {err && <p className="callout callout-warn text-xs text-loss">{err}</p>}
      {(step || authBusy) && <p className="num text-xs text-accent-fg">{step ?? authBusy}</p>}
      <button
        type="button"
        className="btn btn-primary btn-block"
        disabled={!elig || !allChecked || !!step}
        onClick={async () => {
          if (needs.length) {
            try {
              await api("/api/eligibility", { method: "POST", body: JSON.stringify({ items: needs }) });
            } catch (e) {
              return setErr((e as Error).message);
            }
          }
          await claim();
        }}
      >
        Claim it
      </button>
      <p className="fine">
        {p.agentManaged ? "This bag is run by the nearbags AI agent; claiming lets it rebalance your account inside the bag's limits. " : ""}Claim by {p.expiresAt.slice(0, 10)}.
      </p>
    </>,
  );
}
