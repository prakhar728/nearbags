"use client";
// Phones: once the buy box has scrolled off the top, a Buy pill floats above the tab bar and jumps back to it.
import { useEffect, useState } from "react";

export function StickyBuy({ targetId, minBuyUsd }: { targetId: string; minBuyUsd: number }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const el = document.getElementById(targetId);
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setShow(!e.isIntersecting && e.boundingClientRect.top < 0), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, [targetId]);
  return (
    <div
      className={`pointer-events-none fixed inset-x-0 z-40 flex justify-center px-4 transition-[opacity,transform] duration-300 ease-out md:hidden ${show ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"}`}
      style={{ bottom: "calc(max(12px, env(safe-area-inset-bottom)) + 76px)" }}
      aria-hidden={!show}
    >
      <button
        type="button"
        tabIndex={show ? 0 : -1}
        onClick={() => document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "start" })}
        className={`btn btn-primary w-full max-w-sm shadow-[var(--shadow-lg)] ${show ? "pointer-events-auto" : ""}`}
      >
        Buy this bag <span className="num font-normal opacity-70">· from ${minBuyUsd}</span>
      </button>
    </div>
  );
}
