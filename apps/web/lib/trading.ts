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
