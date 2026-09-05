import type { OrderBook } from "../book/orderBook.js";

export type MarkPriceSnapshot = {
  mark: number | null;
  // Prefer BBO mid; fall back to last trade. 
  source: "mid" | "last" | null;
  bestBid: number | null;
  bestAsk: number | null;
  lastTradePrice: number | null;
  timestamp: number;
};

// Demo mark: mid of BBO when two-sided, else last trade.
export function resolveMarkPrice(
  book: OrderBook,
  lastTradePrice: number | null,
): MarkPriceSnapshot {
  const bbo = book.getBbo();
  const timestamp = Date.now();
  if (bbo.bestBid != null && bbo.bestAsk != null) {
    return {
      mark: Math.floor((Number(bbo.bestBid) + Number(bbo.bestAsk)) / 2),
      source: "mid",
      bestBid: bbo.bestBid,
      bestAsk: bbo.bestAsk,
      lastTradePrice,
      timestamp,
    };
  }
  if (lastTradePrice != null) {
    return {
      mark: lastTradePrice,
      source: "last",
      bestBid: bbo.bestBid,
      bestAsk: bbo.bestAsk,
      lastTradePrice,
      timestamp,
    };
  }
  return {
    mark: null,
    source: null,
    bestBid: bbo.bestBid,
    bestAsk: bbo.bestAsk,
    lastTradePrice,
    timestamp,
  };
}
