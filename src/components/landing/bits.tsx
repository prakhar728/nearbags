"use client";
// Small landing effects: in-view reveal, decrypting hex, live clock.
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

const SESSION_LABEL: Record<Session, string> = { pre: "Pre-market", regular: "Market open", post: "After hours", overnight: "Overnight", weekend: "Weekend" };

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
  if (!now) return <span>New York --:--:--</span>;
  const t = now.toLocaleTimeString("en-US", { timeZone: "America/New_York", hour12: false });
  return (
    <span>
      New York {t} · {SESSION_LABEL[usSession(now)]}
    </span>
  );
}
