import type {
  AssetId,
  MarketSymbol,
  Order,
  OrderEvent,
  OrderStatus,
  OrderType,
  Side,
  TimeInForce,
} from "@cex/exchange-types";

/*
  Shared contracts for the application layer (OMS ↔ XPG ↔ Price).

  Redis Streams  = order command/event mailbox (not the engine WAL)
  Redis pub/sub  = live market-data fan-out
  Timescale      = durable ticks / history (written by XPG)
*/

/** Redis Stream: OMS → XPG (place / cancel / credit). */
export const ORDERS_COMMANDS_STREAM = "orders:commands" as const;

/** Redis Stream: XPG → OMS (fills, status, rejects). */
export const ORDERS_EVENTS_STREAM = "orders:events" as const;

/** Consumer group on orders:commands (Exchange Processor Gateway). */
export const XPG_COMMANDS_GROUP = "xpg" as const;

/** Consumer group on orders:events (Order Management Service). */
export const OMS_EVENTS_GROUP = "oms" as const;

export function mdBboChannel(market: MarketSymbol = "SOL-USD"): string {
  return `md:${market}:bbo`;
}

export function mdTradeChannel(market: MarketSymbol = "SOL-USD"): string {
  return `md:${market}:trade`;
}

export type AppCommandType = "PLACE" | "CANCEL" | "CREDIT";

export type PlaceCommand = {
  commandId: string;
  type: "PLACE";
  userId: string;
  clientOrderId: string;
  market: MarketSymbol;
  side: Side;
  orderType: OrderType;
  timeInForce: TimeInForce;
  /** Integer ticks; 0 for MARKET. */
  price: number;
  /** Integer lots. */
  quantity: number;
  quoteBudget?: number;
  /** Optional engine order id; otherwise XPG/engine may assign. */
  orderId?: string;
  timestamp: number;
};

export type CancelCommand = {
  commandId: string;
  type: "CANCEL";
  userId: string;
  clientOrderId?: string;
  orderId: string;
  market: MarketSymbol;
  timestamp: number;
};

export type CreditCommand = {
  commandId: string;
  type: "CREDIT";
  userId: string;
  asset: AssetId;
  /** Integer asset units. */
  amount: number;
  timestamp: number;
};

export type AppCommand = PlaceCommand | CancelCommand | CreditCommand;

export type AppOrderEventType =
  | "ACCEPTED"
  | "REJECTED"
  | "RESTING"
  | "FILL"
  | "CANCELLED"
  | "CREDIT_OK"
  | "CREDIT_FAILED"
  | "COMMAND_FAILED";

export type AppOrderEvent = {
  eventId: string;
  commandId?: string;
  type: AppOrderEventType;
  userId: string;
  market: MarketSymbol;
  orderId?: string;
  clientOrderId?: string;
  status?: OrderStatus;
  /** Engine order event when applicable. */
  engineEvent?: OrderEvent;
  /** Engine order snapshot after place/cancel when available. */
  order?: Order;
  reason?: string;
  fills?: Array<{
    tradeId: string;
    price: number;
    quantity: number;
  }>;
  timestamp: number;
};

export type BboMessage = {
  market: MarketSymbol;
  bestBid: number | null;
  bestAsk: number | null;
  timestamp: number;
};

export type TradeTickMessage = {
  market: MarketSymbol;
  tradeId: string;
  price: number;
  quantity: number;
  buyOrderId: string;
  sellOrderId: string;
  timestamp: number;
};

/** Redis Stream entries store JSON in a `payload` field. */
export type StreamEnvelope<T> = {
  payload: T;
};
