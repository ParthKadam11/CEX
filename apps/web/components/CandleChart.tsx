"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

type ChartRow = {
  time: UTCTimestamp;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

function toUnix(bucket: string): UTCTimestamp {
  return Math.floor(new Date(bucket).getTime() / 1000) as UTCTimestamp;
}

function candleRows(candles: Candle[]): ChartRow[] {
  return [...candles]
    .map((candle) => {
      const open = Number(candle.open);
      const close = Number(candle.close);
      const high = Number(candle.high);
      const low = Number(candle.low);
      // Wicks need high/low outside the body; clamp so bad data still draws.
      const bodyTop = Math.max(open, close);
      const bodyBottom = Math.min(open, close);
      return {
        time: toUnix(candle.bucket),
        open,
        close,
        high: Math.max(high, bodyTop),
        low: Math.min(low, bodyBottom),
        volume: Number(candle.volume) || 0,
      };
    })
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

function toCandlePoint(row: ChartRow) {
  return {
    time: row.time,
    open: row.open,
    high: row.high,
    low: row.low,
    close: row.close,
  };
}

function toVolumePoint(
  row: ChartRow,
  colors: ReturnType<typeof themeColors>,
) {
  return {
    time: row.time,
    value: row.volume,
    color: row.close >= row.open ? colors.volumeUp : colors.volumeDown,
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
  const prevTimesRef = useRef<number[]>([]);
  const fittedRef = useRef(false);
  const [hover, setHover] = useState<OhlcHover | null>(null);

  const rows = useMemo(() => candleRows(candles), [candles]);
  const lastRow = rows.at(-1) ?? null;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const colors = themeColors(dark);
    // Prefer explicit size — autoSize alone often stays 0×0 on mobile until a
    // delayed layout pass, leaving a blank chart.
    const chart = createChart(host, {
      width: Math.max(host.clientWidth, 1),
      height: Math.max(host.clientHeight, 1),
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
        secondsVisible: true,
      },
      // Let the page scroll vertically on phones; keep horizontal pan/zoom on chart.
      handleScroll: {
        vertTouchDrag: false,
        horzTouchDrag: true,
        mouseWheel: true,
        pressedMouseMove: true,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: colors.up,
      downColor: colors.down,
      borderVisible: true,
      borderUpColor: colors.up,
      borderDownColor: colors.down,
      wickVisible: true,
      wickUpColor: colors.up,
      wickDownColor: colors.down,
    });
    chart.timeScale().applyOptions({
      barSpacing: 8,
      minBarSpacing: 2,
      rightOffset: 4,
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
    prevTimesRef.current = [];
    fittedRef.current = false;

    // Mobile often mounts the host at 0×0, then grows. Resize + fit once ready.
    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width < 8 || height < 8) return;
      chart.applyOptions({
        width: Math.floor(width),
        height: Math.floor(height),
      });
      if (!fittedRef.current && candleSeriesRef.current) {
        const data = candleSeriesRef.current.data();
        if (data.length > 0) {
          chart.timeScale().fitContent();
          fittedRef.current = true;
        }
      }
    });
    resizeObserver.observe(host);

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
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      prevTimesRef.current = [];
      fittedRef.current = false;
    };
  }, [dark]);

  useEffect(() => {
    chartRef.current?.timeScale().applyOptions({
      secondsVisible:
        intervalLabel.includes("5s") || intervalLabel.includes("15s"),
    });
  }, [intervalLabel]);

  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    const volumeSeries = volumeSeriesRef.current;
    const chart = chartRef.current;
    if (!candleSeries || !volumeSeries || !chart) return;

    const colors = themeColors(dark);

    if (rows.length === 0) {
      candleSeries.setData([]);
      volumeSeries.setData([]);
      prevTimesRef.current = [];
      fittedRef.current = false;
      return;
    }

    const prevTimes = prevTimesRef.current;
    const samePrefix =
      prevTimes.length > 0 &&
      prevTimes.length <= rows.length &&
      prevTimes.every((time, index) => rows[index]!.time === time);
    const last = rows.at(-1)!;
    const nearLiveEdge = (() => {
      const visible = chart.timeScale().getVisibleLogicalRange();
      if (!visible) return true;
      return visible.to >= prevTimes.length - 2;
    })();

    if (samePrefix && rows.length === prevTimes.length) {
      // Same bars — only the live candle mutated.
      candleSeries.update(toCandlePoint(last));
      volumeSeries.update(toVolumePoint(last, colors));
    } else if (samePrefix && rows.length === prevTimes.length + 1) {
      // New bar rolled — append without rebuilding the series.
      candleSeries.update(toCandlePoint(last));
      volumeSeries.update(toVolumePoint(last, colors));
      if (nearLiveEdge) chart.timeScale().scrollToRealTime();
    } else {
      candleSeries.setData(rows.map(toCandlePoint));
      volumeSeries.setData(rows.map((row) => toVolumePoint(row, colors)));
      const host = hostRef.current;
      const ready =
        host != null && host.clientWidth >= 8 && host.clientHeight >= 8;
      if (!fittedRef.current && ready) {
        chart.timeScale().fitContent();
        fittedRef.current = true;
      } else if (nearLiveEdge && fittedRef.current) {
        chart.timeScale().scrollToRealTime();
      }
    }

    prevTimesRef.current = rows.map((row) => row.time);
  }, [rows, dark]);

  const display =
    hover ??
    (lastRow
      ? {
          open: lastRow.open,
          high: lastRow.high,
          low: lastRow.low,
          close: lastRow.close,
          volume: lastRow.volume,
        }
      : null);
  const up = display != null && display.close >= display.open;

  return (
    <div className={`flex h-full min-h-0 flex-col ${className}`}>
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
            Pinch to zoom · drag to pan
          </span>
        )}
      </div>
      <div className="relative min-h-0 flex-1">
        {candles.length === 0 && (
          <div className="absolute inset-0 z-10 flex items-center justify-center text-sm text-zinc-400 dark:text-zinc-500">
            No candle history yet. Trades will populate the chart.
          </div>
        )}
        <div
          ref={hostRef}
          className="h-full min-h-[180px] w-full touch-pan-x"
          style={{ touchAction: "pan-x pinch-zoom" }}
        />
      </div>
    </div>
  );
}

function fmt(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(value < 10 ? 4 : 2);
}
