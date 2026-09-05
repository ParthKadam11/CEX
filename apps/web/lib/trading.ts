import type { Balance } from "@cex/exchange-types";

export type TradingOrderFill = {
  id: string;
  tradeId: string;
  price: number;
  quantity: number;
  createdAt: string;
};

export type TradingOrder = {
  id: string;
  engineOrderId: string;
  clientOrderId: string;
  market?: string;
  side: "BUY" | "SELL";
  type: "LIMIT" | "MARKET";
  timeInForce?: string;
  price: number;
  quantity: number;
  quoteBudget?: number | null;
  filledQuantity: number;
  status: string;
  failureReason?: string | null;
  createdAt: string;
  fills?: TradingOrderFill[];
};

export type Candle = {
  bucket: string;
  market: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  trades: number;
};

export type HistoryTrade = {
  time: string;
  tradeId: string;
  price: number;
  quantity: number;
  buyOrderId: string;
  sellOrderId: string;
};

export type LiveTapeTrade = {
  id: string;
  price: number;
  quantity: number;
  at: number;
};

export type MarketMeta = {
  market: string;
  base: string;
  quote: string;
  tickSize: number;
  lotSize: number;
  status: string;
};

export const OPEN_ORDER_STATUSES = [
  "PENDING",
  "ACCEPTED",
  "OPEN",
  "PARTIALLY_FILLED",
  "CANCEL_REQUESTED",
] as const;

export function balanceFor(
  balances: Balance[],
  asset: Balance["asset"],
): { available: number; locked: number } {
  const row = balances.find((balance) => balance.asset === asset);
  return {
    available: row?.available ?? 0,
    locked: row?.locked ?? 0,
  };
}

export function errorMessage(body: {
  error?: { code?: string; message?: string } | string;
}): string | undefined {
  if (typeof body.error === "string") return body.error;
  return body.error?.message ?? body.error?.code;
}

export function parseEvent<T>(event: Event): T | null {
  try {
    return JSON.parse((event as MessageEvent<string>).data) as T;
  } catch {
    return null;
  }
}

export function formatTime(value: string | number | Date): string {
  const date = typeof value === "string" || typeof value === "number"
    ? new Date(value)
    : value;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function normalizeCandle(
  raw: Partial<Candle> & { bucket: string },
): Candle {
  return {
    bucket: raw.bucket,
    market: raw.market ?? "SOL-USD",
    open: Number(raw.open) || 0,
    high: Number(raw.high) || 0,
    low: Number(raw.low) || 0,
    close: Number(raw.close) || 0,
    volume: Number(raw.volume) || 0,
    trades: Number(raw.trades) || 0,
  };
}

/** Fold a live trade into the current 1m candle (Timescale CAGG lags real-time). */
export function applyTradeToCandles(
  candles: Candle[],
  trade: { price: number; quantity: number; at: number },
): Candle[] {
  const price = Number(trade.price);
  const quantity = Number(trade.quantity);
  if (!Number.isFinite(price) || !Number.isFinite(quantity)) return candles;

  const bucketDate = new Date(trade.at);
  bucketDate.setUTCSeconds(0, 0);
  const bucket = bucketDate.toISOString();

  const next = candles.map(normalizeCandle);
  const index = next.findIndex((candle) => candle.bucket === bucket);
  if (index === -1) {
    return [
      {
        bucket,
        market: "SOL-USD",
        open: price,
        high: price,
        low: price,
        close: price,
        volume: quantity,
        trades: 1,
      },
      ...next,
    ].slice(0, 90);
  }

  const current = next[index]!;
  next[index] = {
    ...current,
    high: Math.max(current.high, price),
    low: Math.min(current.low, price),
    close: price,
    volume: current.volume + quantity,
    trades: current.trades + 1,
  };
  return next;
}

/**
 * Build live candles from the trade tape so the chart moves during sim.
 * Default 1m buckets so high/low wicks have room to form (5s was often flat).
 * Timescale candles_1m only refreshes on a 1m policy with end_offset=1m.
 */
export function buildLiveCandles(
  trades: LiveTapeTrade[],
  bucketMs = 60_000,
  maxBuckets = 60,
): Candle[] {
  if (trades.length === 0) return [];

  const sorted = [...trades].sort((a, b) => a.at - b.at);
  const byBucket = new Map<string, Candle>();

  for (const trade of sorted) {
    const price = Number(trade.price);
    const quantity = Number(trade.quantity);
    if (!Number.isFinite(price) || !Number.isFinite(quantity)) continue;

    const bucketStart = Math.floor(trade.at / bucketMs) * bucketMs;
    const bucket = new Date(bucketStart).toISOString();
    const existing = byBucket.get(bucket);
    if (!existing) {
      byBucket.set(bucket, {
        bucket,
        market: "SOL-USD",
        open: price,
        high: price,
        low: price,
        close: price,
        volume: quantity,
        trades: 1,
      });
      continue;
    }
    existing.high = Math.max(existing.high, price);
    existing.low = Math.min(existing.low, price);
    existing.close = price;
    existing.volume += quantity;
    existing.trades += 1;
  }

  return [...byBucket.values()]
    .sort((a, b) => b.bucket.localeCompare(a.bucket))
    .slice(0, maxBuckets);
}

