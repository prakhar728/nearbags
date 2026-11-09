"use client";
// Small landing effects: in-view reveal, decrypting hex, scroll-stretched type, tilt cards, magnetic button, live clock.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usSession, type Session } from "@/lib/trade/guard";

/** Adds `lp-in` to the wrapper the first time it scrolls into view. */
export function Reveal({ children, className = "", as: Tag = "div", threshold = 0.25 }: { children: React.ReactNode; className?: string; as?: "div" | "section"; threshold?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current!;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          el.classList.add("lp-in");
          io.disconnect();
        }
      },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return (
    <Tag ref={ref} className={`lp-reveal ${className}`}>
      {children}
    </Tag>
  );
}

/** One masked line that slides up on reveal. */
export const Line = ({ i = 0, children }: { i?: number; children: React.ReactNode }) => (
  <span className="lp-line">
    <span style={{ "--i": i } as React.CSSProperties}>{children}</span>
  </span>
);

const HEX = "0123456789abcdef";
const randHex = (n: number) => Array.from({ length: n }, () => HEX[Math.floor(Math.random() * 16)]).join("");

/** A 64-char account id that decrypts left to right, holds, then rolls to a new one. */
export function Scramble() {
  const [target, setTarget] = useState("");
  const [shown, setShown] = useState("");
  const [locked, setLocked] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let hold: ReturnType<typeof setTimeout> | undefined;
    const run = () => {
      const t = randHex(64);
      setTarget(t);
      if (reduce) {
        setShown(t);
        setLocked(64);
        return;
      }
      const t0 = performance.now();
      const tick = (now: number) => {
        const n = Math.min(64, Math.floor((now - t0) / 22));
        setLocked(n);
        setShown(t.slice(0, n) + randHex(64 - n));
        if (n < 64) raf = requestAnimationFrame(tick);
        else hold = setTimeout(run, 4200);
      };
      raf = requestAnimationFrame(tick);
    };
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !started.current) {
        started.current = true;
        run();
      }
    });
    io.observe(ref.current!);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
      clearTimeout(hold);
    };
  }, []);

  const s = shown || "·".repeat(64);
  return (
    <div ref={ref} className="lp-hex" aria-label={target ? `Example basket account ${target}` : "Example basket account"}>
      <span className="lp-locked">{s.slice(0, locked)}</span>
      <span className="lp-wild">{s.slice(locked)}</span>
    </div>
  );
}

/** Sets --w (font width 50–150) on its child from how far the element has scrolled through the viewport. */
export function ScrollStretch({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current!;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.style.setProperty("--w", "110");
      return;
    }
    let raf = 0;
    const update = () => {
      const r = el.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, (window.innerHeight - r.top) / (window.innerHeight + r.height)));
      el.style.setProperty("--w", String(Math.round(50 + p * 100)));
      raf = 0;
    };
    const onScroll = () => (raf ||= requestAnimationFrame(update));
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

/** Card that tilts toward the cursor. */
export function Tilt({ children, className = "", href, style }: { children: React.ReactNode; className?: string; href: string; style?: React.CSSProperties }) {
  const ref = useRef<HTMLAnchorElement>(null);
  const onMove = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    const el = ref.current!;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `perspective(900px) rotateX(${(-py * 8).toFixed(2)}deg) rotateY(${(px * 10).toFixed(2)}deg) translateY(-4px)`;
  };
  const reset = () => ref.current && (ref.current.style.transform = "");
  return (
    <Link ref={ref} href={href} className={className} style={style} onPointerMove={onMove} onPointerLeave={reset}>
      {children}
    </Link>
  );
}

/** Button that leans toward the cursor when it's near. */
export function Magnetic({ href, children }: { href: string; children: React.ReactNode }) {
  const ref = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    const el = ref.current!;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    let tx = 0;
    let ty = 0;
    let cx = 0;
    let cy = 0;
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      const d = Math.hypot(dx, dy);
      const R = Math.max(r.width, r.height) * 0.9;
      tx = d < R ? dx * 0.22 : 0;
      ty = d < R ? dy * 0.3 : 0;
      raf ||= requestAnimationFrame(tick);
    };
    const tick = () => {
      cx += (tx - cx) * 0.18;
      cy += (ty - cy) * 0.18;
      el.style.transform = `translate(${cx.toFixed(1)}px, ${cy.toFixed(1)}px) rotate(${(cx * 0.04).toFixed(2)}deg)`;
      raf = Math.abs(tx - cx) + Math.abs(ty - cy) > 0.2 ? requestAnimationFrame(tick) : 0;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
    };
  }, []);
  return (
    <Link ref={ref} href={href} className="lp-magnet">
      {children}
    </Link>
  );
}

const SESSION_LABEL: Record<Session, string> = { pre: "PRE-MARKET", regular: "MARKET OPEN", post: "AFTER HOURS", overnight: "OVERNIGHT", weekend: "WEEKEND" };

/** Live New York clock + US session: stocks trade as tokens around it. */
export function SessionClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);
  if (!now) return <span>NEW YORK --:--:--</span>;
  const t = now.toLocaleTimeString("en-US", { timeZone: "America/New_York", hour12: false });
  return (
    <span>
      NEW YORK {t} · {SESSION_LABEL[usSession(now)]}
    </span>
  );
}
