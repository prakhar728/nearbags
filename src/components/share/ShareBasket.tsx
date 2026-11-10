"use client";
// Share a basket: post on X, copy the link, or the device's share sheet. The link preview image comes from
// app/(app)/b/[slug]/opengraph-image.tsx.
import { useEffect, useRef, useState } from "react";

export function shareUrl(path: string) {
  return typeof window === "undefined" ? path : new URL(path, window.location.origin).toString();
}

export function xIntent(text: string, url: string) {
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
}

export function ShareBasket({ slug, name, tagline, className = "" }: { slug: string; name: string; tagline: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const url = shareUrl(`/b/${slug}`);
  const text = `${name}: ${tagline}\n\nOne buy, the whole bag, from any chain.`;
  const canNative = typeof navigator !== "undefined" && typeof navigator.share === "function";

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  async function copy() {
    await navigator.clipboard.writeText(url).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div ref={box} className={`relative inline-block ${className}`}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="btn btn-secondary btn-sm"
      >
        <ShareIcon /> Share
      </button>
      {open && (
        <div role="menu" className="pop absolute right-0 z-30 mt-2 grid w-56 gap-1 rounded-[var(--r-lg)] border border-[var(--line-strong)] bg-[var(--elev)] p-1.5 shadow-[var(--shadow-lg)]">
          <a role="menuitem" href={xIntent(text, url)} target="_blank" rel="noopener noreferrer" className="rounded-xl px-3 py-2.5 text-sm hover:bg-[var(--layer-2)]">
            Post on X
          </a>
          <button role="menuitem" type="button" onClick={copy} className="rounded-xl px-3 py-2.5 text-left text-sm hover:bg-[var(--layer-2)]">
            {copied ? "Link copied" : "Copy link"}
          </button>
          {canNative && (
            <button role="menuitem" type="button" onClick={() => navigator.share({ title: `${name} · nearbags`, text: tagline, url }).catch(() => {})} className="rounded-xl px-3 py-2.5 text-left text-sm hover:bg-[var(--layer-2)]">
              More…
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function ShareIcon() {
  return (
    <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" />
      <path d="M16 6l-4-4-4 4" />
      <path d="M12 2v13" />
    </svg>
  );
}
