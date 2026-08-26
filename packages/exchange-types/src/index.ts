export enum Side {
  BUY = "BUY",
  SELL = "SELL",
}

export enum OrderType {
  LIMIT = "LIMIT",
  MARKET = "MARKET",
}

export enum TimeInForce {
  GTC = "GTC", // Good-Till-Cancelled
  IOC = "IOC", // Immediate-or-Cancel
  FOK = "FOK", // Fill-or-Kill
  FOK_BUDGET = "FOK_BUDGET" // Fill-or-Kill with budget not implemented yet
}

export type OrderStatus =
  | "NEW"
  | "OPEN"
  | "PARTIALLY_FILLED"
  | "FILLED"
  | "CANCELLED"
  | "REJECTED";

export type MarketSymbol = "SOL-USD";

export type AssetId = "SOL" | "USD";

export interface Asset {
  id: AssetId;
  decimals: number;
}

export interface Balance {
  userId: string;
  asset: AssetId;
  /** Integer asset units (available to spend / withdraw). */
  available: number;
  /** Integer asset units reserved for open orders. */
  locked: number;
}

export type LedgerReason =
  | "DEPOSIT"
  | "LOCK_ORDER"
  | "UNLOCK_ORDER"
  | "SETTLE_DEBIT"
  | "SETTLE_CREDIT"
  | "WITHDRAW";

export type LedgerRefType = "ORDER" | "TRADE" | "DEPOSIT" | "WITHDRAW";

export interface LedgerEntry {
  seq: number;
  userId: string;
  asset: AssetId;
  availableDelta: number;
  lockedDelta: number;
  availableAfter: number;
  lockedAfter: number;
  reason: LedgerReason;
  refType?: LedgerRefType;
  refId?: string;
  timestamp: number;
}

export interface Market {
  symbol: MarketSymbol;
  base: "SOL";
  quote: "USD";
  /** Minimum price increment in integer ticks. */
  tickSize: number;
  /** Minimum size increment in integer lots. */
  lotSize: number;
  status: "OPEN" | "CLOSED";
}

export interface Order {
  orderId: string;
  userId: string;
  market: MarketSymbol;
  side: Side;
  type: OrderType;
  timeInForce: TimeInForce;
  /** Limit price in integer ticks (MARKET uses 0). */
  price: number;
  /** Size in integer lots. */
  quantity: number;
  /** MARKET buy: integer quote units to spend. */
  quoteBudget?: number;
  /** Filled size in integer lots. */
  filledQuantity: number;
  status: OrderStatus;
  timestamp: number;
}

export interface Trade {
  tradeId: string;
  market: MarketSymbol;
  /** Trade price in integer ticks (maker price). */
  price: number;
  /** Fill size in integer lots. */
  quantity: number;
  buyOrderId: string;
  sellOrderId: string;
  buyerUserId: string;
  sellerUserId: string;
  timestamp: number;
}

export interface BookLevel {
  price: number;
  quantity: number;
  count: number;
}

export interface OrderBookSnapshot {
  market: MarketSymbol;
  bids: BookLevel[];
  asks: BookLevel[];
  bbo: {
    bestBid: number | null;
    bestAsk: number | null;
  };
}

export interface PlacementResult {
  order: Order;
  trades: Trade[];
  accepted: boolean;
}

export type CancelFailReason = "UNKNOWN_ORDER" | "NOT_CANCELLABLE";

export interface CancelResult {
  order?: Order;
  cancelled: boolean;
  reason?: CancelFailReason;
}


export type OrderEventType =
  | "REJECTED"
  | "FILL"
  | "RESTING"
  | "CANCELLED"
  | "STATUS";

export type RejectReason =
  | "UNSUPPORTED_TIF"
  | "FOK_INSUFFICIENT_LIQUIDITY"
  | "INSUFFICIENT_BALANCE"
  | "MARKET_MISSING_QUOTE_BUDGET"
  | "INVALID_UNITS";

export interface OrderEvent {
  seq: number;
  type: OrderEventType;
  orderId: string;
  userId: string;
  market: MarketSymbol;
  timestamp: number;
  status?: OrderStatus;
  fromStatus?: OrderStatus;
  toStatus?: OrderStatus;
  tradeId?: string;
  price?: number;
  quantity?: number;
  reason?: RejectReason | string;
}

export type OrderQueryFilter = {
  status?: OrderStatus | readonly OrderStatus[];
  market?: MarketSymbol;
  openOnly?: boolean;
};

/** Durable engine commands (WAL). Replay restores RAM after restart. */
export type EngineCommandBody =
  | {
      type: "CREDIT";
      userId: string;
      asset: AssetId;
      amount: number;
      timestamp: number;
    }
  | {
      type: "PLACE";
      order: Order;
      timestamp: number;
    }
  | {
      type: "CANCEL";
      orderId: string;
      timestamp: number;
    };

export type EngineCommand = EngineCommandBody & { seq: number };

/** Live SSE payloads from the exchange process (ORDER / BBO / CREDIT). */
export type ExchangeStreamEvent =
  | { kind: "ORDER"; market: MarketSymbol; event: OrderEvent }
  | {
      kind: "BBO";
      market: MarketSymbol;
      bestBid: number | null;
      bestAsk: number | null;
    }
  | {
      kind: "CREDIT";
      market: MarketSymbol;
      userId: string;
      asset: AssetId;
      amount: number;
    };

/** HTTP response for POST .../credit */
export type CreditResult = {
  balance: Balance;
  entry: LedgerEntry;
};
