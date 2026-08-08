export enum Side{"BUY", "SELL"};

export enum OrderType{"LIMIT"}; // MARKET later

export enum TimeInForce {
  GTC = "GTC", // Good-Till-Cancelled
  IOC = "IOC", // Immediate-or-Cancel
  FOK = "FOK", // Fill-or-Kill
  FOK_BUDGET = "FOK_BUDGET" // Fill-or-Kill with budget
}

export type OrderStatus =
  | "NEW"
  | "OPEN"
  | "PARTIALLY_FILLED"
  | "FILLED"
  | "CANCELLED"
  | "REJECTED";

export type MarketSymbol = "SOL-USD";

export interface Asset {
  id: "SOL" | "USD";
  decimals: number;
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

export interface PriceLevel {
  price: number;
  orders: Order[]; // FIFO at this price (MBO)
  // derived:
  // quantity = sum(quantity - filledQuantity)
  // count = orders.length
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
  bids: BookLevel[]; // best bid first (desc)
  asks: BookLevel[]; // best ask first (asc)
  bbo: {
    bestBid: number | null;
    bestAsk: number | null;
  };
}
