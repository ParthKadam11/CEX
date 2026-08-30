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

// Redis Stream: OMS → XPG (place / cancel / credit).
export const ORDERS_COMMANDS_STREAM = "orders:commands" as const;

// Redis Stream: malformed commands removed from orders:commands. 
export const ORDERS_COMMANDS_DLQ_STREAM = "orders:commands:dlq" as const;

// Redis Stream: XPG → OMS (fills, status, rejects). 
export const ORDERS_EVENTS_STREAM = "orders:events" as const;

// Redis Stream: malformed events removed from orders:events.
export const ORDERS_EVENTS_DLQ_STREAM = "orders:events:dlq" as const;

// Consumer group on orders:commands (Exchange Processor Gateway). 
export const XPG_COMMANDS_GROUP = "xpg" as const;

// Consumer group on orders:events (Order Management Service). 
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
  // Integer ticks; 0 for MARKET. 
  price: number;
  // Integer lots. 
  quantity: number;
  quoteBudget?: number;
  // Optional engine order id; otherwise XPG/engine may assign. 
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
  // Integer asset units. 
  amount: number;
  timestamp: number;
};

export type AppCommand = PlaceCommand | CancelCommand | CreditCommand;

export function isAppCommand(value: unknown): value is AppCommand {
  if (!isRecord(value)) return false;
  if (
    typeof value.commandId !== "string" ||
    value.commandId.length === 0 ||
    typeof value.userId !== "string" ||
    value.userId.length === 0
  ) {
    return false;
  }

  if (value.type === "CREDIT") {
    return (
      (value.asset === "SOL" || value.asset === "USD") &&
      typeof value.amount === "number" &&
      Number.isFinite(value.amount) &&
      typeof value.timestamp === "number"
    );
  }

  if (value.type === "CANCEL") {
    return (
      typeof value.orderId === "string" &&
      value.orderId.length > 0 &&
      value.market === "SOL-USD" &&
      (value.clientOrderId === undefined ||
        typeof value.clientOrderId === "string") &&
      typeof value.timestamp === "number"
    );
  }

  if (value.type === "PLACE") {
    return (
      typeof value.clientOrderId === "string" &&
      value.clientOrderId.length > 0 &&
      value.market === "SOL-USD" &&
      (value.side === "BUY" || value.side === "SELL") &&
      (value.orderType === "LIMIT" || value.orderType === "MARKET") &&
      (value.timeInForce === "GTC" ||
        value.timeInForce === "IOC" ||
        value.timeInForce === "FOK" ||
        value.timeInForce === "FOK_BUDGET") &&
      typeof value.price === "number" &&
      Number.isFinite(value.price) &&
      typeof value.quantity === "number" &&
      Number.isFinite(value.quantity) &&
      (value.quoteBudget === undefined ||
        (typeof value.quoteBudget === "number" &&
          Number.isFinite(value.quoteBudget))) &&
      (value.orderId === undefined || typeof value.orderId === "string") &&
      typeof value.timestamp === "number"
    );
  }

  return false;
}

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
  // Engine order event when applicable. 
  engineEvent?: OrderEvent;
  // Engine order snapshot after place/cancel when available.
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

// Redis Stream entries store JSON in a `payload` field.
export type StreamEnvelope<T> = {
  payload: T;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
