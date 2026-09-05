"use client";

import { useEffect, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { useTheme } from "@/components/ThemeProvider";
import type { Candle } from "@/lib/trading";

type CandleChartProps = {
  candles: Candle[];
  intervalLabel?: string;
  className?: string;
};

type OhlcHover = {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

function toUnix(bucket: string): UTCTimestamp {
  return Math.floor(new Date(bucket).getTime() / 1000) as UTCTimestamp;
}

function candleRows(candles: Candle[]) {
  return [...candles]
    .map((candle) => ({
      time: toUnix(candle.bucket),
      open: Number(candle.open),
      high: Number(candle.high),
      low: Number(candle.low),
      close: Number(candle.close),
      volume: Number(candle.volume) || 0,
    }))
    .filter(
      (row) =>
        Number.isFinite(row.open) &&
        Number.isFinite(row.high) &&
        Number.isFinite(row.low) &&
        Number.isFinite(row.close) &&
        Number.isFinite(row.time),
    )
    .sort((a, b) => a.time - b.time)
    .filter((row, index, all) => index === 0 || row.time !== all[index - 1]!.time);
}

function themeColors(dark: boolean) {
  return dark
    ? {
        background: "#09090b",
        text: "#a1a1aa",
        grid: "#1f1f23",
        border: "#27272a",
        crosshair: "#52525b",
        up: "#10b981",
        down: "#ef4444",
        volumeUp: "rgba(16, 185, 129, 0.35)",
        volumeDown: "rgba(239, 68, 68, 0.35)",
      }
    : {
        background: "#ffffff",
        text: "#71717a",
        grid: "#f4f4f5",
        border: "#e4e4e7",
        crosshair: "#a1a1aa",
        up: "#059669",
        down: "#dc2626",
        volumeUp: "rgba(5, 150, 105, 0.28)",
        volumeDown: "rgba(220, 38, 38, 0.28)",
      };
}

export function CandleChart({
  candles,
  intervalLabel = "1m",
  className = "",
}: CandleChartProps) {
  const { theme } = useTheme();
  const dark = theme === "dark";
  const hostRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const [hover, setHover] = useState<OhlcHover | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const colors = themeColors(dark);
    const chart = createChart(host, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: colors.background },
        textColor: colors.text,
        fontFamily:
          "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        fontSize: 11,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: colors.grid },
        horzLines: { color: colors.grid },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: colors.crosshair,
          labelBackgroundColor: colors.border,
        },
        horzLine: {
          color: colors.crosshair,
          labelBackgroundColor: colors.border,
        },
      },
      rightPriceScale: {
        borderColor: colors.border,
        scaleMargins: { top: 0.08, bottom: 0.22 },
      },
      timeScale: {
        borderColor: colors.border,
        timeVisible: true,
        secondsVisible: intervalLabel.includes("5s"),
      },
      handleScroll: { vertTouchDrag: false },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: colors.up,
      downColor: colors.down,
      borderUpColor: colors.up,
      borderDownColor: colors.down,
      wickUpColor: colors.up,
      wickDownColor: colors.down,
    });
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
    });
    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.seriesData) {
        setHover(null);
        return;
      }
      const candle = param.seriesData.get(candleSeries) as
        | { open: number; high: number; low: number; close: number }
        | undefined;
      const volume = param.seriesData.get(volumeSeries) as
        | { value: number }
        | undefined;
      if (!candle) {
        setHover(null);
        return;
      }
      setHover({
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: volume?.value ?? 0,
      });
    });

    return () => {
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
  }, [dark, intervalLabel]);

  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    const volumeSeries = volumeSeriesRef.current;
    const chart = chartRef.current;
    if (!candleSeries || !volumeSeries || !chart) return;

    const rows = candleRows(candles);
    if (rows.length === 0) {
      candleSeries.setData([]);
      volumeSeries.setData([]);
      setHover(null);
      return;
    }

    candleSeries.setData(
      rows.map(({ time, open, high, low, close }) => ({
        time,
        open,
        high,
        low,
        close,
      })),
    );
    volumeSeries.setData(
      rows.map((row) => ({
        time: row.time,
        value: row.volume,
        color: row.close >= row.open
          ? themeColors(dark).volumeUp
          : themeColors(dark).volumeDown,
      })),
    );

    const last = rows.at(-1)!;
    setHover({
      open: last.open,
      high: last.high,
      low: last.low,
      close: last.close,
      volume: last.volume,
    });
    chart.timeScale().fitContent();
  }, [candles, dark]);

  const display = hover;
  const up = display != null && display.close >= display.open;

  return (
    <div className={`flex h-full min-h-[280px] flex-col ${className}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 pb-2 pt-2 text-[11px] tabular-nums">
        <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
          {intervalLabel}
        </span>
        {display ? (
          <>
            <span className={up ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}>
              O {fmt(display.open)}
            </span>
            <span className={up ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}>
              H {fmt(display.high)}
            </span>
            <span className={up ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}>
              L {fmt(display.low)}
            </span>
            <span className={up ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}>
              C {fmt(display.close)}
            </span>
            <span className="text-zinc-400 dark:text-zinc-500">
              Vol {fmt(display.volume)}
            </span>
          </>
        ) : (
          <span className="text-zinc-400 dark:text-zinc-500">
            Hover chart for OHLC · scroll to zoom · drag to pan
          </span>
        )}
      </div>
      <div className="relative min-h-0 flex-1">
        {candles.length === 0 && (
          <div className="absolute inset-0 z-10 flex items-center justify-center text-sm text-zinc-400 dark:text-zinc-500">
            No candle history yet. Trades will populate the chart.
          </div>
        )}
        <div ref={hostRef} className="h-full w-full" />
      </div>
    </div>
  );
}

function fmt(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(value < 10 ? 4 : 2);
}
