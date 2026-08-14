import {
  Side,
  TimeInForce,
  type Order,
  type PlacementResult,
} from "@cex/exchange-types";
import { MatchingEngine } from "../matching/engine.js";
import { OrderBook } from "../orderbook/orderBook.js";
import { remaining } from "../orderbook/orderHelpers.js";
import {
  transitionCancel,
  transitionReject,
} from "../order/orderStateMachine.js";

/*
  OrderPlacementService = apply TimeInForce around MatchingEngine.

  Flow:
    1. reject unsupported TIF (e.g. FOK_BUDGET for now)
    2. FOK → read-only liquidity check; if not enough, REJECT (book untouched)
    3. match against the book (status via state machine on fills)
    4. leftover handling:
         GTC → rest remainder on book
         IOC → cancel remainder (do not rest)
         FOK → should be fully filled after step 2

  Call place() one-at-a-time per market (no concurrent book mutation).
*/

export class OrderPlacementService {
  constructor(private readonly matcher = new MatchingEngine()) {}

  place(order: Order, book: OrderBook): PlacementResult {
    // only GTC / IOC / FOK supported right now
    if (
      order.timeInForce !== TimeInForce.GTC &&
      order.timeInForce !== TimeInForce.IOC &&
      order.timeInForce !== TimeInForce.FOK
    ) {
      transitionReject(order);
      return { order, trades: [], accepted: false };
    }

    // FOK: all-or-nothing — check before mutating the book
    if (order.timeInForce === TimeInForce.FOK && !this.canFullyFill(order, book)) {
      transitionReject(order);
      return { order, trades: [], accepted: false };
    }

    // cross against resting liquidity
    const { trades, taker } = this.matcher.match(order, book);

    // what to do with unfilled size
    if (remaining(taker) > 0) {
      if (taker.timeInForce === TimeInForce.GTC) {
        // rest leftover as a maker
        book.add(taker);
      } else if (taker.timeInForce === TimeInForce.IOC) {
        // immediate-or-cancel: never rest
        transitionCancel(taker);
      }
      // FOK should not reach here with leftover (precheck passed)
    }

    return { order: taker, trades, accepted: true };
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
