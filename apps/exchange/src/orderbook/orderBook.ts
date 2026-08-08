/*
TO-DO OrderBook

data structures:
  bids: Map<number, PriceLevel>   // price → level
  asks: Map<number, PriceLevel>
  orderIndex: Map<string, { side; price }>

methods:
  add(order)              // rest on book
  remove(orderId)         // cancel
  getBestBid() / getBestAsk()
  getBbo()
  getSnapshot()
*/

import type { MarketSymbol } from "@cex/exchange-types";

// Stub — implement next
export class OrderBook {
  readonly market: MarketSymbol;

  constructor(market: MarketSymbol = "SOL-USD") {
    this.market = market;
  }
}
