import {
  OrderType,
  Side,
  TimeInForce,
  type AssetId,
  type CancelResult,
  type Order,
  type PlacementResult,
  type RejectReason,
  type Trade,
} from "@cex/exchange-types";
import { MatchingEngine } from "../matching/matchingEngine.js";
import { OrderBook } from "../book/orderBook.js";
import { remaining } from "../order/orderHelpers.js";
import {
  isTerminal,
  transitionCancel,
  transitionReject,
} from "../order/orderStateMachine.js";
import { OrderEventLog } from "../order/orderEventLog.js";
import { OrderStore } from "../order/orderStore.js";
import { OrderQueryService } from "../order/orderQueryService.js";
import {
  BalanceService,
  type BalanceRef,
} from "../account/balanceService.js";
import { InsufficientBalanceError } from "../account/balanceStore.js";
import { lockForOrder, marketAssets } from "../market/assets.js";

type OrderLock = { asset: AssetId; amount: number };

/*
  OrderPlacementService = TimeInForce + balances + order event log + order store.

  MatchingEngine only crosses orders. This class:
    - locks funds before matching
    - settles balances on each trade
    - unlocks leftovers (IOC / MARKET leftover / FOK reject / user cancel)
    - records order events and keeps OrderStore in sync

  MARKET:
    - buy locks quoteBudget; sell locks base qty
    - never rests (leftover always cancelled + unlocked)
    - matcher ignores limit price; buy stops when budget is spent

  Call place() one-at-a-time per market (no concurrent book mutation).
*/

export class OrderPlacementService {
  private readonly matcher: MatchingEngine;
  private readonly log: OrderEventLog;
  private readonly store: OrderStore;
  private readonly money: BalanceService;
  //How much is still reserved per live order (after fills / unlocks). 
  private readonly locks = new Map<string, OrderLock>();
  readonly queries: OrderQueryService;

  constructor(
    matcher = new MatchingEngine(),
    log = new OrderEventLog(),
    store = new OrderStore(),
    money = new BalanceService(),
  ) {
    this.matcher = matcher;
    this.log = log;
    this.store = store;
    this.money = money;
    this.queries = new OrderQueryService(store, log);
  }

  get eventLog(): OrderEventLog {
    return this.log;
  }

  get balances(): BalanceService {
    return this.money;
  }

  place(order: Order, book: OrderBook): PlacementResult {
    if (
      order.timeInForce !== TimeInForce.GTC &&
      order.timeInForce !== TimeInForce.IOC &&
      order.timeInForce !== TimeInForce.FOK
    ) {
      return this.reject(order, "UNSUPPORTED_TIF");
    }

    if (
      order.type === OrderType.MARKET &&
      order.side === Side.BUY &&
      !(order.quoteBudget && order.quoteBudget > 0)
    ) {
      return this.reject(order, "MARKET_MISSING_QUOTE_BUDGET");
    }

    try {
      this.lockOrder(order);
    } catch (err) {
      if (err instanceof InsufficientBalanceError) {
        return this.reject(order, "INSUFFICIENT_BALANCE");
      }
      throw err;
    }

    if (order.timeInForce === TimeInForce.FOK && !this.canFullyFill(order, book)) {
      this.unlockOrder(order);
      return this.reject(order, "FOK_INSUFFICIENT_LIQUIDITY");
    }

    const takerFrom = order.status;
    const { trades, taker } = this.matcher.match(order, book);

    this.settleAndLogFills(trades, book, taker);
    this.logStatus(taker, takerFrom);

    if (remaining(taker) > 0) {
      const isMarket = taker.type === OrderType.MARKET;

      if (!isMarket && taker.timeInForce === TimeInForce.GTC) {
        book.add(taker);
        this.log.append({
          type: "RESTING",
          orderId: taker.orderId,
          userId: taker.userId,
          market: taker.market,
          status: taker.status,
          quantity: remaining(taker),
        });
      } else if (isMarket || taker.timeInForce === TimeInForce.IOC) {
        // MARKET never rests; IOC never rests
        this.unlockOrder(taker);
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
      // FOK LIMIT should not reach here with leftover (precheck passed)
    } else {
      this.locks.delete(taker.orderId);
    }

    this.store.upsert(taker);
    return { order: taker, trades, accepted: true };
  }

  cancel(orderId: string, book: OrderBook): CancelResult {
    const order = this.store.get(orderId);
    if (!order) {
      return { cancelled: false, reason: "UNKNOWN_ORDER" };
    }
    if (isTerminal(order.status)) {
      return { order, cancelled: false, reason: "NOT_CANCELLABLE" };
    }

    book.remove(orderId);
    this.unlockOrder(order);

    const fromStatus = order.status;
    transitionCancel(order);
    this.log.append({
      type: "CANCELLED",
      orderId: order.orderId,
      userId: order.userId,
      market: order.market,
      fromStatus,
      status: order.status,
      quantity: remaining(order),
    });
    this.store.upsert(order);
    return { order, cancelled: true };
  }

  private reject(order: Order, reason: RejectReason): PlacementResult {
    const fromStatus = order.status;
    transitionReject(order);
    this.log.append({
      type: "REJECTED",
      orderId: order.orderId,
      userId: order.userId,
      market: order.market,
      fromStatus,
      status: order.status,
      reason,
    });
    this.store.upsert(order);
    return { order, trades: [], accepted: false };
  }

  private lockOrder(order: Order): void {
    const need = lockForOrder(order);
    if (!need) {
      throw new Error(`cannot lock order ${order.orderId}`);
    }

    const ref: BalanceRef = { refType: "ORDER", refId: order.orderId };
    this.money.lock(order.userId, need.asset, need.amount, ref);
    this.locks.set(order.orderId, { asset: need.asset, amount: need.amount });
  }

  private unlockOrder(order: Order): void {
    const lock = this.locks.get(order.orderId);
    if (!lock || lock.amount <= 0) {
      this.locks.delete(order.orderId);
      return;
    }
    this.money.unlock(order.userId, lock.asset, lock.amount, {
      refType: "ORDER",
      refId: order.orderId,
    });
    this.locks.delete(order.orderId);
  }

  private settleAndLogFills(
    trades: Trade[],
    book: OrderBook,
    taker: Order,
  ): void {
    const { base, quote } = marketAssets(taker.market);

    for (const trade of trades) {
      // market buy: reserved per fill = actual cost (budget pool, no limit improvement)
      const buyLimit = this.buyReservePrice(trade.buyOrderId, taker, trade.price);
      const { buyLockRelease, sellLockRelease } = this.money.settleTrade({
        trade,
        buyLimitPrice: buyLimit,
        base,
        quote,
      });

      this.releaseTrackedLock(trade.buyOrderId, buyLockRelease);
      this.releaseTrackedLock(trade.sellOrderId, sellLockRelease);
      this.dropEmptyLock(trade.buyOrderId);
      this.dropEmptyLock(trade.sellOrderId);

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

  // Limit buy uses order.price; market buy uses trade price so reserve === cost. */
  private buyReservePrice(
    orderId: string,
    taker: Order,
    tradePrice: number,
  ): number {
    if (taker.orderId === orderId) {
      return taker.type === OrderType.MARKET ? tradePrice : taker.price;
    }
    const order = this.store.get(orderId);
    if (!order) {
      throw new Error(`unknown order ${orderId} for settlement`);
    }
    return order.type === OrderType.MARKET ? tradePrice : order.price;
  }

  private releaseTrackedLock(orderId: string, amount: number): void {
    const lock = this.locks.get(orderId);
    if (!lock) return;
    lock.amount -= amount;
    if (lock.amount < 0) {
      throw new Error(`lock underflow for order ${orderId}`);
    }
  }

  private dropEmptyLock(orderId: string): void {
    const lock = this.locks.get(orderId);
    if (lock && lock.amount === 0) this.locks.delete(orderId);
  }

  private statusAfterFill(
    orderId: string,
    book: OrderBook,
    taker: Order,
  ): Order["status"] | undefined {
    if (taker.orderId === orderId) return taker.status;
    return book.getOrder(orderId)?.status ?? "FILLED";
  }

  private logStatus(order: Order, fromStatus: Order["status"]): void {
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

  private canFullyFill(taker: Order, book: OrderBook): boolean {
    const isMarket = taker.type === OrderType.MARKET;

    // market buy FOK: enough ask volume that quoteBudget can buy full quantity
    if (isMarket && taker.side === Side.BUY) {
      let need = remaining(taker);
      let budget = taker.quoteBudget ?? 0;
      if (need <= 0) return true;
      for (const level of book.iterateAsksFromBest()) {
        const affordable = budget / level.price;
        const take = Math.min(need, level.getTotalVolume(), affordable);
        if (take <= 0) break;
        need -= take;
        budget -= take * level.price;
        if (need <= 0) return true;
      }
      return false;
    }

    let need = remaining(taker);
    if (need <= 0) return true;

    const levels =
      taker.side === Side.BUY
        ? book.iterateAsksFromBest()
        : book.iterateBidsFromBest();

    for (const level of levels) {
      if (!isMarket) {
        if (taker.side === Side.BUY && level.price > taker.price) break;
        if (taker.side === Side.SELL && level.price < taker.price) break;
      }
      need -= level.getTotalVolume();
      if (need <= 0) return true;
    }
    return false;
  }
}
