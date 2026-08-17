export enum Side {
  BUY = "BUY",
  SELL = "SELL",
}

export enum OrderType{"LIMIT"}; // MARKET later

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
  available: number;
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
  tickSize: number;
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
  price: number;
  quantity: number;
  quoteBudget?: number;
  filledQuantity: number;
  status: OrderStatus;
  timestamp: number;
}

export interface Trade {
  tradeId: string;
  market: MarketSymbol;
  price: number;
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


export type OrderEventType =
  | "REJECTED"
  | "FILL"
  | "RESTING"
  | "CANCELLED"
  | "STATUS";

export type RejectReason =
  | "UNSUPPORTED_TIF"
  | "FOK_INSUFFICIENT_LIQUIDITY"
  | "INSUFFICIENT_BALANCE";

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