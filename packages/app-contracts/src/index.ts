import {
  isBoundedPositiveInteger,
  isIdentifier,
  isMarketSymbol,
  isTimestamp,
  MAX_ORDER_PRICE,
  MAX_ORDER_QUANTITY,
  MAX_QUOTE_BUDGET,
  isSafePositiveInteger,
  type AssetId,
  type MarketSymbol,
  type Order,
  type OrderEvent,
  type OrderStatus,
  type OrderType,
  type Side,
  type TimeInForce,
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
export const COMMAND_STREAM_MAXLEN = 100_000;
export const EVENT_STREAM_MAXLEN = 100_000;
export const DLQ_STREAM_MAXLEN = 25_000;
export const MARKET_DATA_STREAM = "md:events" as const;
export const MARKET_DATA_CONSUMER_GROUP = "timescale-writer" as const;
export const MARKET_DATA_STREAM_MAXLEN = 1_000_000;
export const MARKET_DATA_DLQ_STREAM = "md:events:dlq" as const;
export const MARKET_DATA_DLQ_MAXLEN = 25_000;

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
  /** Perp only: integer leverage. */
  leverage?: number;
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
  /** Target engine market; defaults to SOL-USD when omitted. */
  market?: MarketSymbol;
  timestamp: number;
};

export type AppCommand = PlaceCommand | CancelCommand | CreditCommand;

export function isAppCommand(value: unknown): value is AppCommand {
  if (!isRecord(value)) return false;
  if (
    !isIdentifier(value.commandId) ||
    !isIdentifier(value.userId)
  ) {
    return false;
  }

  if (value.type === "CREDIT") {
    return (
      (value.asset === "SOL" || value.asset === "USD") &&
      isBoundedPositiveInteger(value.amount, MAX_QUOTE_BUDGET) &&
      (value.market === undefined || isMarketSymbol(value.market)) &&
      isTimestamp(value.timestamp)
    );
  }

  if (value.type === "CANCEL") {
    return (
      isIdentifier(value.orderId) &&
      isMarketSymbol(value.market) &&
      (value.clientOrderId === undefined ||
        isIdentifier(value.clientOrderId)) &&
      isTimestamp(value.timestamp)
    );
  }

  if (value.type === "PLACE") {
    const isMarket = value.orderType === "MARKET";
    const hasBudget =
      value.quoteBudget === undefined ||
      isBoundedPositiveInteger(value.quoteBudget, MAX_QUOTE_BUDGET);
    const budgetRequired =
      isMarket &&
      (value.side === "BUY" || value.market === "SOL-USD-PERP");
    const leverageOk =
      value.leverage === undefined ||
      (isSafePositiveInteger(value.leverage) && value.leverage <= 20);

    return (
      isIdentifier(value.clientOrderId) &&
      isMarketSymbol(value.market) &&
      (value.side === "BUY" || value.side === "SELL") &&
      (value.orderType === "LIMIT" || value.orderType === "MARKET") &&
      (value.timeInForce === "GTC" ||
        value.timeInForce === "IOC" ||
        value.timeInForce === "FOK" ||
        value.timeInForce === "FOK_BUDGET") &&
      (isMarket
        ? value.price === 0
        : isBoundedPositiveInteger(value.price, MAX_ORDER_PRICE)) &&
      isBoundedPositiveInteger(value.quantity, MAX_ORDER_QUANTITY) &&
      hasBudget &&
      (!budgetRequired || isSafePositiveInteger(value.quoteBudget)) &&
      leverageOk &&
      (value.timeInForce !== "FOK_BUDGET" ||
        (isMarket &&
          value.side === "BUY" &&
          isBoundedPositiveInteger(value.quoteBudget, MAX_QUOTE_BUDGET))) &&
      (value.orderId === undefined || isIdentifier(value.orderId)) &&
      isTimestamp(value.timestamp)
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
  | "COMMAND_FAILED"
  | "POSITION";

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
  /** Perp position snapshot when type is POSITION. */
  position?: {
    size: number;
    entryPrice: number;
    margin: number;
    leverage: number;
    updatedAt: number;
  };
  /** Monotonic engine event sequence when sourced from exchange SSE. */
  engineSequence?: number;
  timestamp: number;
};

export type BboMessage = {
  market: MarketSymbol;
  bestBid: number | null;
  bestAsk: number | null;
  engineSequence: number;
  timestamp: number;
};

export type TradeTickMessage = {
  market: MarketSymbol;
  tradeId: string;
  engineSequence: number;
  price: number;
  quantity: number;
  buyOrderId: string;
  sellOrderId: string;
  timestamp: number;
};

export type MarketDataEvent =
  | {
      eventId: string;
      kind: "BBO";
      payload: BboMessage;
    }
  | {
      eventId: string;
      kind: "TRADE";
      payload: TradeTickMessage;
    };

export function isMarketDataEvent(value: unknown): value is MarketDataEvent {
  if (!isRecord(value) || !isIdentifier(value.eventId)) return false;
  if (value.kind === "BBO") {
    const payload = value.payload;
    return (
      isRecord(payload) &&
      isMarketSymbol(payload.market) &&
      isTimestamp(payload.timestamp) &&
      isSafePositiveInteger(payload.engineSequence) &&
      isNullableUnit(payload.bestBid) &&
      isNullableUnit(payload.bestAsk)
    );
  }
  if (value.kind === "TRADE") {
    const payload = value.payload;
    return (
      isRecord(payload) &&
      isMarketSymbol(payload.market) &&
      isIdentifier(payload.tradeId) &&
      isIdentifier(payload.buyOrderId) &&
      isIdentifier(payload.sellOrderId) &&
      isSafePositiveInteger(payload.engineSequence) &&
      isSafePositiveInteger(payload.price) &&
      isSafePositiveInteger(payload.quantity) &&
      isTimestamp(payload.timestamp)
    );
  }
  return false;
}

function isNullableUnit(value: unknown): value is number | null {
  return value === null || isSafePositiveInteger(value);
}

// Spot convert/swap: product UX over marketable SOL-USD orders (not perps).
export type SpotSwapAsset = "SOL" | "USD";

export type SpotSwapInput = {
  fromAsset: SpotSwapAsset;
  toAsset: SpotSwapAsset;
  // Integer asset units: USD ticks for USD→SOL, SOL lots for SOL→USD.
  amount: number;
  clientOrderId: string;
  // IOC takes available liquidity; FOK is only valid for SOL→USD (sell all or reject).
  fillMode?: "IOC" | "FOK";
};

export type SpotSwapOrderBody = {
  clientOrderId: string;
  market: "SOL-USD";
  side: "BUY" | "SELL";
  orderType: "MARKET";
  timeInForce: "IOC" | "FOK";
  price: 0;
  quantity: number;
  quoteBudget?: number;
};

export function buildSpotSwapOrder(
  input: SpotSwapInput,
): SpotSwapOrderBody | { error: string } {
  if (!isIdentifier(input.clientOrderId)) {
    return { error: "INVALID_CLIENT_ORDER_ID" };
  }
  if (
    (input.fromAsset !== "SOL" && input.fromAsset !== "USD") ||
    (input.toAsset !== "SOL" && input.toAsset !== "USD") ||
    input.fromAsset === input.toAsset
  ) {
    return { error: "INVALID_SWAP_PAIR" };
  }
  if (!isBoundedPositiveInteger(input.amount, MAX_QUOTE_BUDGET)) {
    return { error: "INVALID_SWAP_AMOUNT" };
  }

  const mode = input.fillMode ?? "IOC";
  if (mode !== "IOC" && mode !== "FOK") {
    return { error: "INVALID_FILL_MODE" };
  }

  // USD → SOL: spend `amount` quote on as much base as liquidity allows.
  if (input.fromAsset === "USD" && input.toAsset === "SOL") {
    if (mode === "FOK") {
      return { error: "FOK_REQUIRES_SOL_SELL" };
    }
    return {
      clientOrderId: input.clientOrderId,
      market: "SOL-USD",
      side: "BUY",
      orderType: "MARKET",
      timeInForce: "IOC",
      price: 0,
      quantity: MAX_ORDER_QUANTITY,
      quoteBudget: input.amount,
    };
  }

  // SOL → USD: sell `amount` base into bids.
  if (!isBoundedPositiveInteger(input.amount, MAX_ORDER_QUANTITY)) {
    return { error: "INVALID_SWAP_AMOUNT" };
  }
  return {
    clientOrderId: input.clientOrderId,
    market: "SOL-USD",
    side: "SELL",
    orderType: "MARKET",
    timeInForce: mode,
    price: 0,
    quantity: input.amount,
  };
}

export function isSpotSwapInput(value: unknown): value is SpotSwapInput {
  if (!isRecord(value)) return false;
  return (
    (value.fromAsset === "SOL" || value.fromAsset === "USD") &&
    (value.toAsset === "SOL" || value.toAsset === "USD") &&
    isSafePositiveInteger(value.amount) &&
    isIdentifier(value.clientOrderId) &&
    (value.fillMode === undefined ||
      value.fillMode === "IOC" ||
      value.fillMode === "FOK")
  );
}

// Redis Stream entries store JSON in a `payload` field.
export type StreamEnvelope<T> = {
  payload: T;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
