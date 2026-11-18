"use client";
// Gifts you sent: copy a link again (on the device that made it), finish a buy that stopped half way, or take a gift
// back into your own account for that bag. Taking back works on any device: your wallet is a recovery key on it.
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Section } from "@/components/ui/Primitives";
import { useAuth } from "@/lib/client/auth";
import { giftLink, moveGift, ownAccountFor, signWithKey } from "@/lib/client/gift";
import { giftKey } from "@/lib/client/keystore";
import { driveOrder } from "@/lib/client/order-runner";
import { usd } from "@/lib/format";

interface Sent {
  code: string;
  basketId: number;
  basket: string;
  slug: string;
  agentManaged: boolean;
  accountId: string;
  message: string | null;
  status: "funding" | "ready" | "claimed" | "reclaimed" | "cancelled" | "expired";
  expiresAt: string;
  createdAt: string;
  claimedAt: string | null;
  lastOrder: { id: number; status: string } | null;
  valueUsd: number | null;
}

const LABEL: Record<Sent["status"], string> = {
  funding: "Not paid yet",
  ready: "Waiting to be claimed",
  claimed: "Claimed",
  reclaimed: "Taken back",
  cancelled: "Cancelled, but money arrived",
  expired: "Expired, still yours",
};

/** An unpaid gift whose payment never started: it can be cancelled (the server checks again). */
const UNPAID = ["preflight", "awaiting_deposit", "failed", "refunded"];

export function GiftsSent() {
  const { user, keyForBasket, walletSign } = useAuth();
  const [gifts, setGifts] = useState<Sent[] | null>(null);
  const [onDevice, setOnDevice] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<Record<string, string>>({});
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/gifts", { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !user) return;
    setGifts(j.gifts);
    const has: Record<string, boolean> = {};
    for (const g of j.gifts as Sent[]) has[g.code] = Boolean(await giftKey(user.address, g.code).catch(() => null));
    setOnDevice(has);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let live = true;
    fetch("/api/gifts", { cache: "no-store" })
      .then((r) => r.json())
      .then(async (j) => {
        if (!live || !j.gifts) return;
        setGifts(j.gifts);
        const has: Record<string, boolean> = {};
        for (const g of j.gifts as Sent[]) has[g.code] = Boolean(await giftKey(user.address, g.code).catch(() => null));
        if (live) setOnDevice(has);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [user]);

  if (!user || !gifts?.length) return null;

  const act = async (code: string, fn: (setStep: (s: string | null) => void) => Promise<void>) => {
    setErrs((e) => ({ ...e, [code]: "" }));
    const setStep = (s: string | null) => setBusy((b) => ({ ...b, [code]: s ?? "" }));
    try {
      await fn(setStep);
      await load();
    } catch (e) {
      setErrs((x) => ({ ...x, [code]: (e as Error).message }));
    } finally {
      setStep(null);
    }
  };

  const copy = (g: Sent) =>
    act(g.code, async () => {
      const k = await giftKey(user.address, g.code);
      if (!k) throw new Error("This device doesn't have the link.");
      await navigator.clipboard.writeText(giftLink(g.code, k));
      setCopied(g.code);
      setTimeout(() => setCopied(null), 1500);
    });

  const finish = (g: Sent) =>
    act(g.code, async (setStep) => {
      const k = await giftKey(user.address, g.code);
      if (!k || !g.lastOrder) throw new Error("Finish it on the device you bought it on.");
      setStep("Finishing the buy…");
      await driveOrder(g.lastOrder.id, k, { onUpdate: (v) => setStep(`Finishing the buy… (${v.order.status.replace("_", " ")})`) });
    });

  const cancel = (g: Sent) =>
    act(g.code, async (setStep) => {
      setStep("Cancelling…");
      const r = await fetch(`/api/gifts/${g.code}`, { method: "DELETE" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? "Couldn't cancel it.");
    });

  const takeBack = (g: Sent) =>
    act(g.code, async (setStep) => {
      const own = await ownAccountFor(g.basketId, g.agentManaged, { keyForBasket, walletPubkey: user.walletPubkey, setStep });
      const k = await giftKey(user.address, g.code);
      setStep(k && g.status !== "reclaimed" ? "Moving it into your own account…" : "Approve in your wallet to move it into your own account…");
      // Taking it back also removes the gift's own key, so the link stops working everywhere, not only on nearbags.
      await moveGift(g.code, "reclaim", g.accountId, own.accountId, { gift: k ? signWithKey(k) : null, wallet: walletSign });
    });

  return (
    <Section title="Gifts you sent" right={<span className="badge">{gifts.length}</span>}>
      <ul className="grid gap-3">
        {gifts.map((g) => {
          // Taken back, but money landed in its account afterwards (a late deposit): that can come back too.
          const open = g.status === "ready" || g.status === "expired" || g.status === "funding" || g.status === "cancelled" || g.status === "reclaimed";
          const cancellable = g.status === "funding" && (!g.lastOrder || UNPAID.includes(g.lastOrder.status)) && (g.valueUsd ?? 0) <= 0.01;
          const midBuy = g.status === "funding" && g.lastOrder && ["funded", "fees_paid", "legs_running", "partial"].includes(g.lastOrder.status);
          const step = busy[g.code];
          return (
            <li key={g.code} className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 space-y-1">
                <div className="text-sm font-medium">
                  <Link href={`/b/${g.slug}`} className="hover:underline">
                    {g.basket}
                  </Link>{" "}
                  <span className="font-normal text-muted">· {g.status === "reclaimed" && (g.valueUsd ?? 0) > 0.01 ? "Taken back, but more money arrived" : LABEL[g.status]}</span>
                </div>
                <div className="num text-xs text-faint">
                  {g.valueUsd != null && open && (g.status !== "reclaimed" || g.valueUsd > 0.01) ? `${usd(g.valueUsd, { cents: true })} · ` : ""}
                  {g.status === "ready" ? `claim by ${g.expiresAt.slice(0, 10)}` : g.claimedAt ? g.claimedAt.slice(0, 10) : `made ${g.createdAt.slice(0, 10)}`}
                  {g.message ? ` · “${g.message.slice(0, 60)}${g.message.length > 60 ? "…" : ""}”` : ""}
                </div>
                {step && <div className="text-xs text-accent-fg">{step}</div>}
                {errs[g.code] && <div className="text-xs text-loss">{errs[g.code]}</div>}
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                {g.status === "ready" && onDevice[g.code] && (
                  <button type="button" className="btn btn-secondary btn-sm" disabled={!!step} onClick={() => copy(g)}>
                    {copied === g.code ? "Copied" : "Copy link"}
                  </button>
                )}
                {midBuy && onDevice[g.code] && (
                  <button type="button" className="btn btn-secondary btn-sm" disabled={!!step} onClick={() => finish(g)}>
                    Finish buying
                  </button>
                )}
                {cancellable && (
                  <button type="button" className="btn btn-ghost btn-sm" disabled={!!step} onClick={() => cancel(g)}>
                    Cancel
                  </button>
                )}
                {open && (g.valueUsd ?? 0) > 0.01 && (
                  <button type="button" className="btn btn-ghost btn-sm" disabled={!!step} onClick={() => takeBack(g)}>
                    Take back
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
