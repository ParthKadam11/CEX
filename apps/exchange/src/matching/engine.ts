import { Side, type Order, type Trade } from "@cex/exchange-types";
import { OrderBook } from "../orderbook/orderBook.js";
import { remaining, updateStatus } from "../orderbook/orderHelpers.js";

/*
  MatchingEngine = cross the incoming order (taker) against the book.

  - Does NOT decide TimeInForce (GTC/IOC/FOK) — that is OrderPlacementService
  - Does NOT rest leftover size on the book — caller does that for GTC
  - Trade price = maker price (resting order's price)
*/

export class MatchingEngine {
  private tradeSeq = 0;

  match(taker: Order, book: OrderBook): { trades: Trade[]; taker: Order } {
    const trades: Trade[] = [];
    const isBuy = taker.side === Side.BUY;

    // keep matching until taker is done or prices no longer cross
    while (remaining(taker) > 0) {
      // buy hits asks; sell hits bids
      const best = isBuy ? book.getBestAsk() : book.getBestBid();
      if (!best) break; // nothing on the other side

      // prices must cross:
      //   buy  → taker.price >= best ask
      //   sell → taker.price <= best bid
      if (isBuy && taker.price < best.price) break;
      if (!isBuy && taker.price > best.price) break;

      // FIFO: first order at that price level
      const maker = best.priceLevel.peekFirst();
      if (!maker) break;

      const qty = Math.min(remaining(taker), remaining(maker));
      trades.push(
        isBuy
          ? this.trade(taker, maker, best.price, qty) // buy is taker
          : this.trade(maker, taker, best.price, qty), // sell is taker
      );

      // update both sides; book.applyFill updates maker volume / may remove maker
      taker.filledQuantity += qty;
      book.applyFill(maker.orderId, qty);
    }

    updateStatus(taker);
    return { trades, taker };
  }

  private trade(buy: Order, sell: Order, price: number, quantity: number): Trade {
    this.tradeSeq += 1;
    return {
      tradeId: `t-${this.tradeSeq}`,
      market: buy.market,
      price,
      quantity,
      buyOrderId: buy.orderId,
      sellOrderId: sell.orderId,
      buyerUserId: buy.userId,
      sellerUserId: sell.userId,
      timestamp: Date.now(),
    };
  }
}
