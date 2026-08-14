import {
  Side,
  TimeInForce,
  type Order,
  type PlacementResult,
  type Trade,
} from "@cex/exchange-types";
import { MatchingEngine } from "../matching/engine.js";
import { OrderBook } from "../orderbook/orderBook.js";
import { remaining } from "../orderbook/orderHelpers.js";
import {
  transitionCancel,
  transitionReject,
} from "../order/orderStateMachine.js";
import { OrderEventLog } from "../order/orderEventLog.js";

/*
  OrderPlacementService = TimeInForce policy + order event log.

  MatchingEngine only crosses orders. This class decides accept / reject /
  rest / cancel, and records what happened in the order event log.

  Flow:
    1. reject unsupported TIF (e.g. FOK_BUDGET for now) → log REJECTED
    2. FOK → read-only liquidity check; not enough → REJECT (book untouched)
    3. match against the book → log FILL for each trade (both sides)
    4. leftover handling:
         GTC → rest remainder on book  → log RESTING
         IOC → cancel remainder        → log CANCELLED
         FOK → should be fully filled after step 2

  Call place() one-at-a-time per market (no concurrent book mutation).
*/

export class OrderPlacementService {
  constructor(
    private readonly matcher = new MatchingEngine(),
    private readonly log = new OrderEventLog(),
  ) {}

  // Read order history / event log. 
  get eventLog(): OrderEventLog {
    return this.log;
  }

  place(order: Order, book: OrderBook): PlacementResult {
    // only GTC / IOC / FOK supported right now
    if (
      order.timeInForce !== TimeInForce.GTC &&
      order.timeInForce !== TimeInForce.IOC &&
      order.timeInForce !== TimeInForce.FOK
    ) {
      const fromStatus = order.status;
      transitionReject(order);
      this.log.append({
        type: "REJECTED",
        orderId: order.orderId,
        userId: order.userId,
        market: order.market,
        fromStatus,
        status: order.status,
        reason: "UNSUPPORTED_TIF",
      });
      return { order, trades: [], accepted: false };
    }

    // FOK: all-or-nothing — check before mutating the book
    if (order.timeInForce === TimeInForce.FOK && !this.canFullyFill(order, book)) {
      const fromStatus = order.status;
      transitionReject(order);
      this.log.append({
        type: "REJECTED",
        orderId: order.orderId,
        userId: order.userId,
        market: order.market,
        fromStatus,
        status: order.status,
        reason: "FOK_INSUFFICIENT_LIQUIDITY",
      });
      return { order, trades: [], accepted: false };
    }

    const takerFrom = order.status;

    // cross against resting liquidity
    const { trades, taker } = this.matcher.match(order, book);

    // one FILL event per order involved in each trade
    this.logFills(trades, book, taker);

    // taker status after match (OPEN / PARTIAL / FILLED)
    this.logStatus(taker, takerFrom);

    // what to do with unfilled size
    if (remaining(taker) > 0) {
      if (taker.timeInForce === TimeInForce.GTC) {
        // rest leftover as a maker
        book.add(taker);
        this.log.append({
          type: "RESTING",
          orderId: taker.orderId,
          userId: taker.userId,
          market: taker.market,
          status: taker.status,
          quantity: remaining(taker),
        });
      } else if (taker.timeInForce === TimeInForce.IOC) {
        // immediate-or-cancel: never rest
        const fromStatus = taker.status;
        transitionCancel(taker);
        this.log.append({
          type: "CANCELLED",
          orderId: taker.orderId,
          userId: taker.userId,
          market: taker.market,
          fromStatus,
          status: taker.status,
          quantity: remaining(taker),
        });
      }
      // FOK should not reach here with leftover (precheck passed)
    }

    return { order: taker, trades, accepted: true };
  }

  // every trade touches two orders, so log a FILL for the buy and the sell side
  private logFills(trades: Trade[], book: OrderBook, taker: Order): void {
    for (const trade of trades) {
      this.log.append({
        type: "FILL",
        orderId: trade.buyOrderId,
        userId: trade.buyerUserId,
        market: trade.market,
        tradeId: trade.tradeId,
        price: trade.price,
        quantity: trade.quantity,
        status: this.statusAfterFill(trade.buyOrderId, book, taker),
      });
      this.log.append({
        type: "FILL",
        orderId: trade.sellOrderId,
        userId: trade.sellerUserId,
        market: trade.market,
        tradeId: trade.tradeId,
        price: trade.price,
        quantity: trade.quantity,
        status: this.statusAfterFill(trade.sellOrderId, book, taker),
      });
    }
  }

  // Taker is in memory; maker may still be on the book (or gone if fully filled).
  private statusAfterFill(
    orderId: string,
    book: OrderBook,
    taker: Order,
  ): Order["status"] | undefined {
    if (taker.orderId === orderId) return taker.status;
    return book.getOrder(orderId)?.status ?? "FILLED";
  }

  // audit trail for state machine moves (NEW → OPEN / PARTIALLY_FILLED / FILLED)
  private logStatus(order: Order, fromStatus: Order["status"]): void {
    // nothing moved → nothing to record
    if (fromStatus === order.status) return;
    this.log.append({
      type: "STATUS",
      orderId: order.orderId,
      userId: order.userId,
      market: order.market,
      fromStatus,
      toStatus: order.status,
      status: order.status,
    });
  }

  // read-only: is there enough crossing volume to fill the whole order?
  private canFullyFill(taker: Order, book: OrderBook): boolean {
    let need = remaining(taker);
    if (need <= 0) return true;

    // buy walks asks (low→high); sell walks bids (high→low)
    const levels =
      taker.side === Side.BUY
        ? book.iterateAsksFromBest()
        : book.iterateBidsFromBest();

    for (const level of levels) {
      // stop when price no longer crosses the limit
      if (taker.side === Side.BUY && level.price > taker.price) break;
      if (taker.side === Side.SELL && level.price < taker.price) break;

      need -= level.getTotalVolume();
      if (need <= 0) return true; // early exit once we have enough
    }
    return false;
  }
}
