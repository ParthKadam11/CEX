"use client";

import { useMemo } from "react";
import type { Candle } from "@/lib/trading";

type CandleChartProps = {
  candles: Candle[];
};

export function CandleChart({ candles }: CandleChartProps) {
  const series = useMemo(
    () => [...candles].reverse().slice(-60),
    [candles],
  );

  const { min, max } = useMemo(() => {
    if (series.length === 0) return { min: 0, max: 1 };
    let low = series[0]!.low;
    let high = series[0]!.high;
    for (const candle of series) {
      low = Math.min(low, candle.low);
      high = Math.max(high, candle.high);
    }
    if (low === high) {
      return { min: low - 1, max: high + 1 };
    }
    const pad = (high - low) * 0.08;
    return { min: low - pad, max: high + pad };
  }, [series]);

  const range = max - min || 1;
  const width = 640;
  const height = 220;
  const gap = 2;
  const barWidth = Math.max(
    3,
    (width - gap * (series.length + 1)) / Math.max(series.length, 1),
  );

  if (series.length === 0) {
    return (
      <div className="flex h-[220px] items-center justify-center text-sm text-zinc-400">
        No candle history yet. Trades will populate 1m candles.
      </div>
    );
  }

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-[220px] w-full min-w-[320px]"
        role="img"
        aria-label="SOL-USD 1 minute candles"
      >
        {series.map((candle, index) => {
          const x = gap + index * (barWidth + gap);
          const yHigh = ((max - candle.high) / range) * (height - 16) + 8;
          const yLow = ((max - candle.low) / range) * (height - 16) + 8;
          const yOpen = ((max - candle.open) / range) * (height - 16) + 8;
          const yClose = ((max - candle.close) / range) * (height - 16) + 8;
          const up = candle.close >= candle.open;
          const bodyTop = Math.min(yOpen, yClose);
          const bodyHeight = Math.max(1, Math.abs(yClose - yOpen));
          const color = up ? "#059669" : "#dc2626";
          return (
            <g key={`${candle.bucket}-${index}`}>
              <line
                x1={x + barWidth / 2}
                x2={x + barWidth / 2}
                y1={yHigh}
                y2={yLow}
                stroke={color}
                strokeWidth="1"
              />
              <rect
                x={x}
                y={bodyTop}
                width={barWidth}
                height={bodyHeight}
                fill={color}
              />
            </g>
          );
        })}
      </svg>
      <div className="mt-2 flex justify-between text-xs text-zinc-400">
        <span>1m · last {series.length}</span>
        <span>
          {series.at(-1)?.close ?? "—"} close · vol{" "}
          {series.at(-1)?.volume ?? 0}
        </span>
      </div>
    </div>
  );
}
