import { OrderType, Side, type Order, type Trade } from "@cex/exchange-types";
import { OrderBook } from "../book/orderBook.js";
import { remaining, updateStatus } from "../order/orderHelpers.js";

/*
  MatchingEngine = cross the incoming order (taker) against the book.

  - Does NOT decide TimeInForce (GTC/IOC/FOK) — that is OrderPlacementService
  - Does NOT rest leftover size on the book — caller does that for GTC
  - Trade price = maker price (resting order's price)
  - MARKET: ignore limit cross; buy may stop when quoteBudget runs out
*/

export class MatchingEngine {
  private tradeSeq = 0;

  match(taker: Order, book: OrderBook): { trades: Trade[]; taker: Order } {
    const trades: Trade[] = [];
    const isBuy = taker.side === Side.BUY;
    const isMarket = taker.type === OrderType.MARKET;

    // market buy spends from quoteBudget; track what's left during this match
    let quoteLeft =
      isMarket && isBuy ? (taker.quoteBudget ?? 0) : Number.POSITIVE_INFINITY;

    while (remaining(taker) > 0) {
      const best = isBuy ? book.getBestAsk() : book.getBestBid();
      if (!best) break;

      // LIMIT must cross; MARKET takes any resting price
      if (!isMarket) {
        if (isBuy && taker.price < best.price) break;
        if (!isBuy && taker.price > best.price) break;
      }

      const maker = best.priceLevel.peekFirst();
      if (!maker) break;

      let qty = Math.min(remaining(taker), remaining(maker));

      // market buy: cannot spend more quote than budget left
      if (isMarket && isBuy) {
        const maxByBudget = quoteLeft / best.price;
        qty = Math.min(qty, maxByBudget);
        if (qty <= 0) break;
      }

      trades.push(
        isBuy
          ? this.trade(taker, maker, best.price, qty)
          : this.trade(maker, taker, best.price, qty),
      );

      taker.filledQuantity += qty;
      book.applyFill(maker.orderId, qty);

      if (isMarket && isBuy) {
        quoteLeft -= best.price * qty;
      }
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
