"use client";
// Thin wrapper over TradingView lightweight-charts for our line charts. Colors come from the CSS tokens.
import { useEffect, useRef } from "react";
import { ColorType, createChart, CrosshairMode, LineSeries, LineStyle, PriceScaleMode, type IChartApi, type ISeriesApi, type LineWidth } from "lightweight-charts";

export interface ChartLine {
  id: string;
  color: string;
  width?: LineWidth;
  dashed?: boolean;
  data: number[]; // aligned with `times`
}

const cssVar = (name: string, fallback: string) =>
  (typeof window !== "undefined" && getComputedStyle(document.documentElement).getPropertyValue(name).trim()) || fallback;

export function LineChart({
  times,
  lines,
  height = 280,
  format,
  onHover,
  logScale = false,
}: {
  times: string[];
  lines: ChartLine[];
  height?: number;
  format: (v: number) => string;
  onHover?: (index: number | null) => void;
  logScale?: boolean;
}) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const series = useRef<ISeriesApi<"Line">[]>([]);
  const hover = useRef(onHover);
  const fmt = useRef(format);
  const timesRef = useRef(times);
  useEffect(() => {
    hover.current = onHover;
    fmt.current = format;
    timesRef.current = times;
  });

  useEffect(() => {
    if (!el.current) return;
    const muted = cssVar("--muted", "#8a8a8a");
    const border = cssVar("--border", "#222222");
    const faint = cssVar("--faint", "#5a5a5a");
    const mono = getComputedStyle(document.body).getPropertyValue("--font-jetbrains").trim() || "ui-monospace, monospace";
    const c = createChart(el.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: muted, fontFamily: mono, fontSize: 11, attributionLogo: true },
      grid: { vertLines: { visible: false }, horzLines: { color: border } },
      rightPriceScale: { borderColor: border },
      timeScale: { borderColor: border, fixLeftEdge: true, fixRightEdge: true },
      crosshair: { mode: CrosshairMode.Magnet, vertLine: { color: faint, labelBackgroundColor: border }, horzLine: { color: faint, labelBackgroundColor: border } },
      localization: { priceFormatter: (v: number) => fmt.current(v) },
      handleScroll: false,
      handleScale: false,
    });
    c.subscribeCrosshairMove((p) => {
      if (!hover.current) return;
      if (!p.time) return hover.current(null);
      const i = timesRef.current.indexOf(String(p.time));
      hover.current(i >= 0 ? i : null);
    });
    chart.current = c;
    return () => {
      c.remove();
      chart.current = null;
      series.current = [];
    };
  }, []);

  useEffect(() => {
    const c = chart.current;
    if (!c) return;
    for (const s of series.current) c.removeSeries(s);
    series.current = lines.map((l) => {
      const s = c.addSeries(LineSeries, {
        color: l.color,
        lineWidth: l.width ?? 1,
        lineStyle: l.dashed ? LineStyle.Dashed : LineStyle.Solid,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: (l.width ?? 1) > 1,
        crosshairMarkerRadius: 3,
      });
      s.setData(times.map((t, i) => ({ time: t, value: l.data[i] })).filter((d) => Number.isFinite(d.value)));
      return s;
    });
    c.priceScale("right").applyOptions({ mode: logScale ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal });
    c.timeScale().fitContent();
  }, [times, lines, logScale]);

  return <div ref={el} style={{ height }} className="w-full" />;
}
