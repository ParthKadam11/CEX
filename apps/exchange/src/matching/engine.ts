import { Side, type Order, type Trade } from "@cex/exchange-types";
import { OrderBook } from "../orderbook/orderBook.js";

function remaining(order: Order): number {
  return order.quantity - order.filledQuantity;
}

function updateStatus(order: Order): void {
  if (remaining(order) <= 0) {
    order.status = "FILLED";
    return;
  }
  if (order.filledQuantity > 0) {
    order.status = "PARTIALLY_FILLED";
    return;
  }
  order.status = "OPEN";
}

export class MatchingEngine {
  private tradeSeq = 0;

  match(taker: Order, book: OrderBook): { trades: Trade[]; taker: Order } {
    const trades: Trade[] = [];

    if (taker.side === Side.BUY) {
      this.matchBuy(taker, book, trades);
    } else {
      this.matchSell(taker, book, trades);
    }

    updateStatus(taker);
    return { trades, taker };
  }

  private matchBuy(taker: Order, book: OrderBook, trades: Trade[]): void {
    while (remaining(taker) > 0) {
      const bestAsk = book.getBestAsk();
      if (!bestAsk || taker.price < bestAsk.price) {
        break;
      }

      const maker = bestAsk.priceLevel.peekFirst();
      if (!maker) {
        break;
      }
      if (remaining(maker) <= 0) {
        book.remove(maker.orderId);
        continue;
      }

      const fillQty = Math.min(remaining(taker), remaining(maker));
      const trade = this.createTrade(taker, maker, bestAsk.price, fillQty);
      trades.push(trade);

      taker.filledQuantity += fillQty;
      maker.filledQuantity += fillQty;
      updateStatus(maker);

      if (remaining(maker) <= 0) {
        book.remove(maker.orderId);
      }
    }
  }

  private matchSell(taker: Order, book: OrderBook, trades: Trade[]): void {
    while (remaining(taker) > 0) {
      const bestBid = book.getBestBid();
      if (!bestBid || taker.price > bestBid.price) {
        break;
      }

      const maker = bestBid.priceLevel.peekFirst();
      if (!maker) {
        break;
      }
      if (remaining(maker) <= 0) {
        book.remove(maker.orderId);
        continue;
      }

      const fillQty = Math.min(remaining(taker), remaining(maker));
      const trade = this.createTrade(maker, taker, bestBid.price, fillQty);
      trades.push(trade);

      taker.filledQuantity += fillQty;
      maker.filledQuantity += fillQty;
      updateStatus(maker);

      if (remaining(maker) <= 0) {
        book.remove(maker.orderId);
      }
    }
  }

  private createTrade(
    buyOrder: Order,
    sellOrder: Order,
    price: number,
    quantity: number,
  ): Trade {
    this.tradeSeq += 1;
    return {
      tradeId: `t-${this.tradeSeq}`,
      market: buyOrder.market,
      price,
      quantity,
      buyOrderId: buyOrder.orderId,
      sellOrderId: sellOrder.orderId,
      buyerUserId: buyOrder.userId,
      sellerUserId: sellOrder.userId,
      timestamp: Date.now(),
    };
  }
}
