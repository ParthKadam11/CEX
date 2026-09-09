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
  FOK_BUDGET = "FOK_BUDGET", // Market buy fill-or-kill within a quote budget
}

export type OrderStatus =
  | "NEW"
  | "OPEN"
  | "PARTIALLY_FILLED"
  | "FILLED"
  | "CANCELLED"
  | "REJECTED";

export type MarketSymbol = "SOL-USD" | "SOL-USD-PERP";

export type MarketKind = "SPOT" | "PERP";

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

// Signed perp position (engine state). size > 0 long, < 0 short. */
export interface Position {
  userId: string;
  market: MarketSymbol;
  size: number;
  // VWAP entry in integer ticks.
  entryPrice: number;
  // USD margin held in balance.locked for this position. 
  margin: number;
  // Effective leverage used while opening/increasing.
  leverage: number;
  updatedAt: number;
}

// Position plus mark-risk fields for GET .../positions.
export type PositionRisk = Position & {
  mark: number | null;
  unrealizedPnl: number | null;
  equity: number | null;
  maintenance: number | null;
  liquidatable: boolean;
  liquidationPrice: number | null;
};

export type LedgerReason =
  | "DEPOSIT"
  | "LOCK_ORDER"
  | "UNLOCK_ORDER"
  | "SETTLE_DEBIT"
  | "SETTLE_CREDIT"
  | "PNL_SETTLE"
  | "FUNDING_SETTLE"
  | "WITHDRAW";

export type LedgerRefType =
  | "ORDER"
  | "TRADE"
  | "DEPOSIT"
  | "WITHDRAW"
  | "POSITION"
  | "FUNDING";

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
  kind: MarketKind;
  base: "SOL";
  quote: "USD";
  // Margin / settlement asset (perps always USD).
  collateral: "USD";
  // Minimum price increment in integer ticks. 
  tickSize: number;
  // Minimum size increment in integer lots.
  lotSize: number;
  status: "OPEN" | "CLOSED";
  // Perp: default leverage when order omits leverage.
  defaultLeverage?: number;
  // Perp: max accepted leverage. 
  maxLeverage?: number;
  // Perp: maintenance margin in bps of notional (e.g. 50 = 0.5%).
  maintenanceMarginBps?: number;
  // Perp: fixed funding rate in bps of notional per interval (positive = longs pay).
  fundingRateBps?: number;
  // Perp: funding settle interval in ms (demo default often 60s).
  fundingIntervalMs?: number;
}

export interface Order {
  orderId: string;
  userId: string;
  market: MarketSymbol;
  side: Side;
  type: OrderType;
  timeInForce: TimeInForce;
  // Limit price in integer ticks (MARKET uses 0). 
  price: number;
  // Size in integer lots
  quantity: number;
  // MARKET buy or FOK_BUDGET: integer quote units to spend. 
  quoteBudget?: number;
  // Perp only: integer leverage (defaults to market.defaultLeverage). 
  leverage?: number;
  // Filled size in integer lots. 
  filledQuantity: number;
  status: OrderStatus;
  timestamp: number;
}

export interface Trade {
  tradeId: string;
  // Monotonic trade sequence assigned by the matching engine.
  engineSequence: number;
  market: MarketSymbol;
  // Trade price in integer ticks (maker price). 
  price: number;
  // Fill size in integer lots.
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
  reason?: RejectReason;
  // Perp markets: positions touched by this placement's fills. 
  positions?: Position[];
  // True when this place matched an existing orderId with the same intent (retry).
  idempotent?: boolean;
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
  | "DUPLICATE_ORDER_ID"
  | "FOK_BUDGET_REQUIRES_MARKET_BUY"
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

export const MAX_IDENTIFIER_LENGTH = 128;
export const MAX_ORDER_QUANTITY = 1_000_000;
export const MAX_ORDER_PRICE = 1_000_000_000;
export const MAX_QUOTE_BUDGET = 1_000_000_000_000_000;
export const MAX_PAGE_LIMIT = 100;

export function isIdentifier(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_IDENTIFIER_LENGTH &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)
  );
}

export function isTimestamp(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0
  );
}

export function isSafePositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

export function isBoundedPositiveInteger(
  value: unknown,
  maximum: number,
): value is number {
  return isSafePositiveInteger(value) && value <= maximum;
}

// Durable engine commands (WAL). Replay restores RAM after restart.
export type EngineCommandBody =
  | {
      type: "CREDIT";
      userId: string;
      asset: AssetId;
      amount: number;
      timestamp: number;
      // Optional idempotency key (gateway commandId). Retries must not double-credit.
      commandId?: string;
    }
  | {
      type: "DEBIT";
      userId: string;
      asset: AssetId;
      amount: number;
      timestamp: number;
      // Optional idempotency key (gateway commandId). Retries must not double-debit.
      commandId?: string;
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
    }
  | {
      type: "LIQUIDATE";
      userId: string;
      market: MarketSymbol;
      mark: number;
      timestamp: number;
    }
  | {
      type: "FUNDING";
      market: MarketSymbol;
      mark: number;
      fundingRateBps: number;
      payments: Array<{ userId: string; payment: number }>;
      timestamp: number;
    };

export type EngineCommand = EngineCommandBody & { seq: number };

// Force-close at mark (perp liquidation).
export type LiquidationEvent = {
  userId: string;
  market: MarketSymbol;
  size: number;
  entryPrice: number;
  mark: number;
  realizedPnl: number;
  marginReleased: number;
  reason: "MAINTENANCE_MARGIN";
  counterpartyUserId: string;
  timestamp: number;
};

// Periodic funding settle for one user (payment = balance delta; + credit / − debit).
export type FundingEvent = {
  userId: string;
  market: MarketSymbol;
  size: number;
  mark: number;
  fundingRateBps: number;
  payment: number;
  timestamp: number;
};

// Live SSE payloads from the exchange process (streamSeq assigned by EventBus).
export type ExchangeStreamEventBody =
  | { kind: "ORDER"; market: MarketSymbol; event: OrderEvent }
  | {
      kind: "BBO";
      market: MarketSymbol;
      bestBid: number | null;
      bestAsk: number | null;
      engineSequence: number;
      timestamp: number;
    }
  | {
      kind: "CREDIT";
      market: MarketSymbol;
      userId: string;
      asset: AssetId;
      amount: number;
    }
  | {
      kind: "DEBIT";
      market: MarketSymbol;
      userId: string;
      asset: AssetId;
      amount: number;
    }
  | { kind: "TRADE"; market: MarketSymbol; trade: Trade }
  | { kind: "POSITION"; market: MarketSymbol; position: Position }
  | {
      kind: "LIQUIDATION";
      market: MarketSymbol;
      liquidation: LiquidationEvent;
    }
  | {
      kind: "FUNDING";
      market: MarketSymbol;
      funding: FundingEvent;
    };

// Sequenced SSE event (monotonic per EventBus / process).
export type ExchangeStreamEvent = ExchangeStreamEventBody & {
  streamSeq: number;
};

export function isMarketSymbol(value: unknown): value is MarketSymbol {
  return value === "SOL-USD" || value === "SOL-USD-PERP";
}
// HTTP response for POST .../credit/ and .../debit/
export type CreditResult = {
  balance: Balance;
  entry: LedgerEntry;
  idempotent?: boolean;
};

export type DebitResult = CreditResult;
