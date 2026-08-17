import {
  Side,
  type BookLevel,
  type MarketSymbol,
  type Order,
  type OrderBookSnapshot,
} from "@cex/exchange-types";
import { PriceLevel } from "./priceLevel.js";

/*
methods:
  add(order)
  remove(orderId)
  applyFill(orderId, qty): used by matching when a maker is hit
  getBestBid() / getBestAsk()
  getBbo()
  getSnapshot(depth)
  getOrder(orderId)
  iterateAsksFromBest() / iterateBidsFromBest(): for FOK liquidity checks
*/

export class OrderBook {
  private readonly symbol: MarketSymbol;
  private readonly bids = new Map<number, PriceLevel>();
  private readonly asks = new Map<number, PriceLevel>();

  // sorted price keys (kept in sync with the maps)
  // bids: high → low (best bid = bidPrices[0])
  // asks: low → high (best ask = askPrices[0])
  private bidPrices: number[] = [];
  private askPrices: number[] = [];

  // orderId => resting order
  private readonly orders = new Map<string, Order>();

  constructor(symbol: MarketSymbol) {
    this.symbol = symbol;
  }

  // adds an order on the book as a maker
  add(order: Order): void {
    const map = order.side === Side.BUY ? this.bids : this.asks;
    const prices = order.side === Side.BUY ? this.bidPrices : this.askPrices;
    const desc = order.side === Side.BUY;

    let level = map.get(order.price);
    // first order at this price => create the level and insert price into sorted list
    if (!level) {
      level = new PriceLevel(order.price);
      map.set(order.price, level);
      prices.push(order.price);
      prices.sort(desc ? (a, b) => b - a : (a, b) => a - b);
    }

    level.addOrder(order);
    this.orders.set(order.orderId, order);
  }

  // cancel a resting order by id
  remove(orderId: string): Order | undefined {
    const order = this.orders.get(orderId);
    if (!order) return undefined;

    const map = order.side === Side.BUY ? this.bids : this.asks;
    const level = map.get(order.price);
    level?.removeOrder(orderId);
    this.orders.delete(orderId);

    // no orders left at this price => drop the level
    if (level?.isEmpty()) this.dropLevel(order.side, order.price);
    return order;
  }

  // matching engine calls this when a resting maker is filled (partial or full)
  applyFill(orderId: string, qty: number): Order {
    const order = this.orders.get(orderId);
    if (!order) throw new Error(`unknown order ${orderId}`);

    const map = order.side === Side.BUY ? this.bids : this.asks;
    const level = map.get(order.price)!;
    level.applyFill(qty);

    // maker fully filled → remove from index; drop empty price level
    if (isFullyFilled(order)) {
      this.orders.delete(orderId);
      if (level.isEmpty()) this.dropLevel(order.side, order.price);
    }
    return order;
  }

  // highest bid price + its PriceLevel
  getBestBid(): { price: number; priceLevel: PriceLevel } | null {
    const price = this.bidPrices[0];
    if (price === undefined) return null;
    return { price, priceLevel: this.bids.get(price)! };
  }

  // lowest ask price + its PriceLevel
  getBestAsk(): { price: number; priceLevel: PriceLevel } | null {
    const price = this.askPrices[0];
    if (price === undefined) return null;
    return { price, priceLevel: this.asks.get(price)! };
  }

  // best bid / best ask only (top of book)
  getBbo(): { bestBid: number | null; bestAsk: number | null } {
    return {
      bestBid: this.bidPrices[0] ?? null,
      bestAsk: this.askPrices[0] ?? null,
    };
  }

  // top N levels for UI / debugging
  getSnapshot(depth = 10): OrderBookSnapshot {
    return {
      market: this.symbol,
      bids: this.levelsSnapshot(this.bidPrices, this.bids, depth),
      asks: this.levelsSnapshot(this.askPrices, this.asks, depth),
      bbo: this.getBbo(),
    };
  }

  getOrder(orderId: string): Order | undefined {
    return this.orders.get(orderId);
  }

  // walk asks from best (lowest) — used by FOK precheck
  iterateAsksFromBest(): Generator<PriceLevel> {
    return this.iterate(this.askPrices, this.asks);
  }

  // walk bids from best (highest) — used by FOK precheck
  iterateBidsFromBest(): Generator<PriceLevel> {
    return this.iterate(this.bidPrices, this.bids);
  }

  // remove empty price from map + sorted price list
  private dropLevel(side: Side, price: number): void {
    if (side === Side.BUY) {
      this.bids.delete(price);
      this.bidPrices = this.bidPrices.filter((p) => p !== price);
    } else {
      this.asks.delete(price);
      this.askPrices = this.askPrices.filter((p) => p !== price);
    }
  }

  private levelsSnapshot(
    prices: number[],
    map: Map<number, PriceLevel>,
    depth: number,
  ): BookLevel[] {
    const out: BookLevel[] = [];
    for (let i = 0; i < prices.length && i < depth; i++) {
      const level = map.get(prices[i]!)!;
      out.push({
        price: level.price,
        quantity: level.getTotalVolume(),
        count: level.getOrderCount(),
      });
    }
    return out;
  }

  private *iterate(
    prices: number[],
    map: Map<number, PriceLevel>,
  ): Generator<PriceLevel> {
    for (const price of prices) {
      yield map.get(price)!;
    }
  }
}

function isFullyFilled(order: Order): boolean {
  return order.quantity - order.filledQuantity <= 0;
}
