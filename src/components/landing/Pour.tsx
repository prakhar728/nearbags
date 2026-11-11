"use client";
// "Any chain in": the stocks and coins of a bag fall with gravity, collide and pile into a bag. Push them around with the cursor.
// Small hand-written physics (circles, gravity, position-based collision). Starts when scrolled into view.
// Coins with a logo in public/logos draw as that logo; the rest draw as a labelled disc.
import { useEffect, useRef } from "react";

// What lands in a bag: tokenized stocks and ETFs mixed with crypto (no stablecoins; you pay with those, you don't bag them).
// Every symbol here has a logo in public/logos.
const COINS = [
  "NVDA", "BTC", "TSLA", "ETH", "AAPL", "MSFT", "SOL", "GOOGL", "AMZN", "NEAR", "META", "SPY", "QQQ",
  "ZEC", "GLD", "HOOD", "CRCL", "XRP", "MRVL", "NVDA", "BTC", "INTC", "HOOT", "TSLA", "SLV", "ETH",
] as const;
const LOGOS = new Set<string>(COINS);

interface Coin {
  x: number;
  y: number;
  px: number;
  py: number;
  r: number;
  sym: string;
  hot: boolean;
  /** Pushed by the cursor: may leave the bag. Until then the walls hold it in at any height. */
  free: boolean;
}

export function Pour() {
  const box = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const shake = useRef<() => void>(() => {});

  useEffect(() => {
    const canvas = cv.current!;
    const ctx = canvas.getContext("2d")!;
    // Colors from the box's own scope (it sits in a dark widget on the green band).
    const css = getComputedStyle(box.current!);
    const C = {
      accent: css.getPropertyValue("--accent").trim() || "#00ec97",
      ink: css.getPropertyValue("--accent-ink").trim() || "#000000",
      text: css.getPropertyValue("--text").trim() || "#ffffff",
      surface: css.getPropertyValue("--surface-2").trim() || "#333333",
      border: css.getPropertyValue("--border-strong").trim() || "rgba(255,255,255,0.2)",
      faint: css.getPropertyValue("--faint").trim() || "#8c8c8c",
    };
    const MONO = `${css.getPropertyValue("--font-figtree").trim() || "ui-sans-serif"}, system-ui, sans-serif`;
    const DISPLAY = MONO;
    const logos = new Map<string, HTMLImageElement>();
    for (const sym of new Set(COINS)) {
      if (!LOGOS.has(sym)) continue;
      const img = new Image();
      img.src = `/logos/${sym}.png`;
      logos.set(sym, img);
    }
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let W = 0;
    let H = 0;
    let coins: Coin[] = [];
    let queue: Coin[] = [];
    let raf = 0;
    let running = false;
    let spawnAt = 0;
    const mouse = { x: -999, y: -999, down: false };

    const fit = () => {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = r.width;
      H = r.height;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    // The bag: open-top container, centred.
    const bag = () => {
      const w = Math.min(W * 0.78, 560);
      const x0 = (W - w) / 2;
      return { x0, x1: x0 + w, top: H * 0.3, floor: H - 22 };
    };

    const make = (): Coin[] => {
      const scale = Math.max(0.72, Math.min(1, W / 900));
      return COINS.map((sym, i) => {
        const r = (sym.length > 3 ? 34 : 30) * scale + (i % 3) * 2;
        const b = bag();
        const x = b.x0 + r + Math.random() * (b.x1 - b.x0 - 2 * r);
        const y = -r - Math.random() * 40;
        return { x, y, px: x + (Math.random() - 0.5) * 2, py: y, r, sym, hot: i % 5 === 0, free: false };
      });
    };

    const step = () => {
      const b = bag();
      const g = 0.42;
      for (const c of coins) {
        const vx = (c.x - c.px) * 0.992;
        const vy = (c.y - c.py) * 0.992;
        c.px = c.x;
        c.py = c.y;
        c.x += vx;
        c.y += vy + g;
        // Cursor pushes coins away.
        const dx = c.x - mouse.x;
        const dy = c.y - mouse.y;
        const d = Math.hypot(dx, dy);
        const R = mouse.down ? 150 : 95;
        if (d < R && d > 0.01) {
          c.free = true;
          const f = ((R - d) / R) * (mouse.down ? 4 : 1.8);
          c.x += (dx / d) * f;
          c.y += (dy / d) * f;
        }
      }
      for (let it = 0; it < 4; it++) {
        for (let i = 0; i < coins.length; i++) {
          const a = coins[i];
          for (let j = i + 1; j < coins.length; j++) {
            const o = coins[j];
            const dx = o.x - a.x;
            const dy = o.y - a.y;
            const min = a.r + o.r;
            const d2 = dx * dx + dy * dy;
            if (d2 < min * min && d2 > 0.0001) {
              const d = Math.sqrt(d2);
              const push = (min - d) / 2;
              const nx = dx / d;
              const ny = dy / d;
              a.x -= nx * push;
              a.y -= ny * push;
              o.x += nx * push;
              o.y += ny * push;
            }
          }
          // Bag walls are solid from both sides below the rim: a coin stays on the side it came from.
          if (a.y + a.r > b.top || !a.free) {
            for (const wx of [b.x0, b.x1]) {
              if (Math.abs(a.x - wx) < a.r) {
                const fromLeft = a.px < wx;
                a.x = fromLeft ? wx - a.r : wx + a.r;
                a.px = a.x;
              }
            }
          }
          if (a.y + a.r > b.floor) {
            a.y = b.floor - a.r;
            a.px = a.x - (a.x - a.px) * 0.6;
          }
          if (a.x - a.r < 0) a.x = a.r;
          if (a.x + a.r > W) a.x = W - a.r;
        }
      }
    };

    const render = () => {
      const b = bag();
      ctx.clearRect(0, 0, W, H);
      // Bag outline: open top, thick, with a little lip.
      ctx.strokeStyle = C.accent;
      ctx.lineWidth = 3;
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(b.x0 - 18, b.top);
      ctx.lineTo(b.x0, b.top);
      ctx.lineTo(b.x0, b.floor);
      ctx.lineTo(b.x1, b.floor);
      ctx.lineTo(b.x1, b.top);
      ctx.lineTo(b.x1 + 18, b.top);
      ctx.stroke();
      ctx.fillStyle = C.faint;
      ctx.font = `600 ${Math.round(Math.min(W / 10, 56))}px ${DISPLAY}`;
      ctx.textAlign = "center";
      ctx.globalAlpha = 0.35;
      ctx.fillText("Your bag", (b.x0 + b.x1) / 2, b.floor - 26);
      ctx.globalAlpha = 1;

      for (const c of coins) {
        const img = logos.get(c.sym);
        if (img?.complete && img.naturalWidth) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
          ctx.clip();
          ctx.fillStyle = "#fff";
          ctx.fill();
          ctx.drawImage(img, c.x - c.r, c.y - c.r, c.r * 2, c.r * 2);
          ctx.restore();
          continue;
        }
        ctx.beginPath();
        ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
        ctx.fillStyle = c.hot ? C.accent : C.surface;
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = c.hot ? C.accent : C.border;
        ctx.stroke();
        ctx.fillStyle = c.hot ? C.ink : C.text;
        ctx.textAlign = "center";
        ctx.font = `700 ${Math.round(c.r * 0.44)}px ${MONO}`;
        ctx.fillText(c.sym, c.x, c.y + c.r * 0.16);
      }
    };

    const loop = (now: number) => {
      if (queue.length && now > spawnAt) {
        coins.push(queue.shift()!);
        spawnAt = now + 110;
      }
      step();
      render();
      raf = requestAnimationFrame(loop);
    };

    const settleInstantly = () => {
      coins = make();
      const b = bag();
      // Place in a rough pile for reduced motion, then let collisions tidy it up.
      coins.forEach((c, i) => {
        c.x = b.x0 + 40 + ((i * 67) % (b.x1 - b.x0 - 80));
        c.y = b.floor - 40 - Math.floor(i / 6) * 50;
        c.px = c.x;
        c.py = c.y;
      });
      for (let k = 0; k < 240; k++) step();
      render();
    };

    const startPour = () => {
      if (reduce) return settleInstantly();
      coins = [];
      queue = make();
      spawnAt = 0;
      if (!running) {
        running = true;
        raf = requestAnimationFrame(loop);
      }
    };
    shake.current = startPour;

    fit();
    const ro = new ResizeObserver(() => {
      fit();
      if (reduce && coins.length) settleInstantly();
    });
    ro.observe(canvas);
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && !coins.length && !queue.length) startPour();
      },
      { threshold: 0.35 },
    );
    io.observe(box.current!);

    const pos = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      mouse.x = e.clientX - r.left;
      mouse.y = e.clientY - r.top;
    };
    const down = (e: PointerEvent) => ((mouse.down = true), pos(e));
    const up = () => (mouse.down = false);
    const leave = () => ((mouse.x = -999), (mouse.y = -999), (mouse.down = false));
    canvas.addEventListener("pointermove", pos);
    canvas.addEventListener("pointerdown", down);
    window.addEventListener("pointerup", up);
    canvas.addEventListener("pointerleave", leave);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      canvas.removeEventListener("pointermove", pos);
      canvas.removeEventListener("pointerdown", down);
      window.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointerleave", leave);
    };
  }, []);

  return (
    <div ref={box} className="lp-pour">
      <button type="button" className="lp-pour-btn" onClick={() => shake.current()}>
        Pour again
      </button>
      <canvas ref={cv} role="img" aria-label="Stock and crypto logos falling into one bag." />
    </div>
  );
}
