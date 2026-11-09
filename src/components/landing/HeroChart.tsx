"use client";
// Hero animation: every asset's real $1,000 path draws itself, then the lines braid into one — the basket.
// Afterwards the chart idles with a pulsing endpoint and a hover readout. Canvas, DPR-aware, reduced-motion safe.
import { useEffect, useRef } from "react";
import { ASSET_COLORS } from "@/lib/palette";

export interface HeroSeries {
  dates: string[];
  basket: number[];
  assets: { id: string; values: number[] }[];
}

const DRAW_MS = 2200;
const BRAID_MS = 1300;
const ease = (t: number) => 1 - Math.pow(1 - t, 3);
const easeIO = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const money = (v: number) => "$" + Math.round(v).toLocaleString("en-US");
const month = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

export function HeroChart({ data, onProgress }: { data: HeroSeries; onProgress?: (value: number, done: boolean) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    const css = getComputedStyle(document.documentElement);
    const C = {
      accent: css.getPropertyValue("--accent").trim() || "#e8ff59",
      text: css.getPropertyValue("--text").trim() || "#ededed",
      muted: css.getPropertyValue("--muted").trim() || "#8a8a8a",
      border: css.getPropertyValue("--border-strong").trim() || "#333",
      bg: css.getPropertyValue("--bg").trim() || "#0a0a0a",
    };
    const MONO = `${css.getPropertyValue("--font-jetbrains").trim() || "ui-monospace"}, monospace`;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const N = data.basket.length;
    // Log scale: NVDA's 6x would otherwise flatten every other line.
    const all = [...data.basket, ...data.assets.flatMap((a) => a.values)];
    const lo = Math.log(Math.min(...all) * 0.92);
    const hi = Math.log(Math.max(...all) * 1.08);
    let W = 0;
    let H = 0;
    let raf = 0;
    let t0 = 0;
    let hover: number | null = null;
    let lastReported = -1;

    const fit = () => {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = r.width;
      H = r.height;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const PAD_R = 92;
    const x = (i: number) => (i / (N - 1)) * (W - PAD_R);
    const y = (v: number) => H - 8 - ((Math.log(Math.max(v, 1)) - lo) / (hi - lo)) * (H - 24);

    const path = (vals: number[], upto: number, mix = 0) => {
      ctx.beginPath();
      const end = Math.max(1, Math.min(N - 1, upto));
      for (let i = 0; i <= end; i++) {
        const v = mix ? vals[i] + (data.basket[i] - vals[i]) * mix : vals[i];
        if (i === 0) ctx.moveTo(x(i), y(v));
        else ctx.lineTo(x(i), y(v));
      }
    };

    const draw = (now: number) => {
      const t = reduce ? DRAW_MS + BRAID_MS : now - t0;
      const pDraw = ease(Math.min(1, t / DRAW_MS));
      const pBraid = easeIO(Math.min(1, Math.max(0, (t - DRAW_MS) / BRAID_MS)));
      const head = pDraw * (N - 1);
      ctx.clearRect(0, 0, W, H);

      // $1,000 baseline
      ctx.strokeStyle = C.border;
      ctx.setLineDash([3, 5]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, y(1000));
      ctx.lineTo(W - PAD_R, y(1000));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = C.muted;
      ctx.font = `10px ${MONO}`;
      ctx.fillText("$1,000", W - PAD_R + 8, y(1000) + 3);

      // Asset lines: draw in, then converge onto the basket line and fade.
      data.assets.forEach((a, k) => {
        ctx.globalAlpha = 0.95 - pBraid * 0.82;
        ctx.strokeStyle = ASSET_COLORS[k % ASSET_COLORS.length];
        ctx.lineWidth = 1.4;
        path(a.values, Math.floor(head), pBraid);
        ctx.stroke();
        if (pBraid < 0.9) {
          const i = Math.floor(head);
          const v = a.values[i] + (data.basket[i] - a.values[i]) * pBraid;
          ctx.globalAlpha = (1 - pBraid) * 0.95;
          ctx.fillStyle = ASSET_COLORS[k % ASSET_COLORS.length];
          ctx.font = `600 11px ${MONO}`;
          ctx.fillText(a.id, x(i) + 6, y(v) - 6);
        }
      });
      ctx.globalAlpha = 1;

      // The basket: grows from nothing to a thick accent line.
      if (pBraid > 0 || reduce) {
        const w = 1 + 2.6 * pBraid;
        ctx.strokeStyle = C.accent;
        ctx.lineWidth = w;
        ctx.lineJoin = "round";
        ctx.globalAlpha = Math.max(0.15, pBraid);
        path(data.basket, N - 1);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // Endpoint + label once braided.
      if (pBraid >= 1) {
        const ex = x(N - 1);
        const ey = y(data.basket[N - 1]);
        const pulse = reduce ? 0 : (Math.sin(now / 380) + 1) / 2;
        ctx.fillStyle = C.accent;
        ctx.globalAlpha = 0.25 * (1 - pulse);
        ctx.beginPath();
        ctx.arc(ex, ey, 6 + pulse * 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(ex, ey, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = `700 13px ${MONO}`;
        ctx.fillText(money(data.basket[N - 1]), ex + 12, ey + 4);
      }

      // Hover readout.
      if (hover != null && pBraid >= 1) {
        const i = hover;
        const hx = x(i);
        ctx.strokeStyle = C.text;
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(hx, 0);
        ctx.lineTo(hx, H);
        ctx.stroke();
        ctx.globalAlpha = 1;
        const hy = y(data.basket[i]);
        ctx.fillStyle = C.accent;
        ctx.beginPath();
        ctx.arc(hx, hy, 4, 0, Math.PI * 2);
        ctx.fill();
        const label = `${month(data.dates[i])}  ${money(data.basket[i])}`;
        ctx.font = `600 12px ${MONO}`;
        const tw = ctx.measureText(label).width + 16;
        const bx = Math.min(Math.max(hx - tw / 2, 0), W - tw);
        const by = Math.max(hy - 40, 4);
        ctx.fillStyle = C.bg;
        ctx.strokeStyle = C.accent;
        ctx.fillRect(bx, by, tw, 24);
        ctx.strokeRect(bx + 0.5, by + 0.5, tw - 1, 23);
        ctx.fillStyle = C.text;
        ctx.fillText(label, bx + 8, by + 16);
      }

      // Tell the page where the counter is.
      const shown = pBraid >= 1 ? data.basket[N - 1] : data.basket[Math.floor(head)];
      if (onProgress && shown !== lastReported) {
        lastReported = shown;
        onProgress(hover != null && pBraid >= 1 ? data.basket[hover] : shown, pBraid >= 1);
      }
      raf = requestAnimationFrame(draw);
    };

    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      const px = e.clientX - r.left;
      if (px < 0 || px > W - PAD_R) return void (hover = null);
      hover = Math.round((px / (W - PAD_R)) * (N - 1));
      lastReported = -1;
    };
    const onLeave = () => {
      hover = null;
      lastReported = -1;
    };

    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(canvas);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerleave", onLeave);
    const start = setTimeout(() => {
      t0 = performance.now();
      raf = requestAnimationFrame(draw);
    }, reduce ? 0 : 450);
    return () => {
      clearTimeout(start);
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
    };
  }, [data, onProgress]);

  return <canvas ref={ref} aria-label="Five asset price lines merging into one basket line: $1,000 grew over five years." role="img" />;
}
