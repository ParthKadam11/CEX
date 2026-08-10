import { Side, TimeInForce, type Order, type Trade } from "@cex/exchange-types";
import { MatchingEngine } from "../matching/engine.js";
import { OrderBook } from "../orderbook/orderBook.js";
import type { PriceLevel } from "../orderbook/priceLevel.js";

export type PlacementResult = {
  order: Order;
  trades: Trade[];
  accepted: boolean;
};

function remaining(order: Order): number {
  return order.quantity - order.filledQuantity;
}

//Uses TimeInForce 
export class OrderPlacementService {
  constructor(private readonly matcher = new MatchingEngine()) {}

  place(order: Order, book: OrderBook): PlacementResult {
    if (
      order.timeInForce !== TimeInForce.GTC &&
      order.timeInForce !== TimeInForce.IOC &&
      order.timeInForce !== TimeInForce.FOK
    ) {
      order.status = "REJECTED";
      return { order, trades: [], accepted: false };
    }

    if (order.timeInForce === TimeInForce.FOK && !this.canFullyFill(order, book)) {
      order.status = "REJECTED";
      return { order, trades: [], accepted: false };
    }

    const { trades, taker } = this.matcher.match(order, book);

    if (remaining(taker) > 0) {
      if (taker.timeInForce === TimeInForce.GTC) {
        book.add(taker);
        // matcher already set OPEN / PARTIALLY_FILLED
      } else if (taker.timeInForce === TimeInForce.IOC) {
        taker.status = "CANCELLED";
      }
      // FOK should never reach here after canFullyFill
    }

    return {
      order: taker,
      trades,
      accepted: true,
    };
  }

  // Read-only walk of crossing liquidity
  private canFullyFill(taker: Order, book: OrderBook): boolean {
    const needed = remaining(taker);
    if (needed <= 0) return true;

    if (taker.side === Side.BUY) {
      return this.availableAskLiquidity(taker.price, book) >= needed;
    }
    return this.availableBidLiquidity(taker.price, book) >= needed;
  }

  private availableAskLiquidity(limitPrice: number, book: OrderBook): number {
    const asks = book.getAsks();
    const prices = Array.from(asks.keys())
      .filter((p) => p <= limitPrice)
      .sort((a, b) => a - b);

    let available = 0;
    for (const price of prices) {
      available += this.levelVolume(asks.get(price)!);
    }
    return available;
  }

  private availableBidLiquidity(limitPrice: number, book: OrderBook): number {
    const bids = book.getBids();
    const prices = Array.from(bids.keys())
      .filter((p) => p >= limitPrice)
      .sort((a, b) => b - a);

    let available = 0;
    for (const price of prices) {
      available += this.levelVolume(bids.get(price)!);
    }
    return available;
  }

  private levelVolume(level: PriceLevel): number {
    return level.getTotalVolume();
  }
}
