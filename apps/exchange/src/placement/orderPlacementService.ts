import {
  Side,
  TimeInForce,
  type AssetId,
  type CancelResult,
  type Order,
  type PlacementResult,
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
import { lockAmount, marketAssets } from "../market/assets.js";

type OrderLock = { asset: AssetId; amount: number };

/*
  OrderPlacementService = TimeInForce + balances + order event log + order store.

  MatchingEngine only crosses orders. This class:
    - locks funds before matching
    - settles balances on each trade
    - unlocks leftovers (IOC leftover / FOK reject / user cancel)
    - records order events and keeps OrderStore in sync

  Flow:
    1. reject unsupported TIF → log REJECTED (no lock)
    2. lock quote (buy) or base (sell); fail → INSUFFICIENT_BALANCE
    3. FOK liquidity check fail → unlock + REJECT
    4. match → settle each trade → log FILL
    5. leftover:
      GTC → rest on book (keep remaining lock) → RESTING
      IOC → unlock leftover + cancel → CANCELLED
      FOK → should be fully filled (lock fully released via settles)

  Call place() one-at-a-time per market (no concurrent book mutation).
*/

export class OrderPlacementService {
  private readonly matcher: MatchingEngine;
  private readonly log: OrderEventLog;
  private readonly store: OrderStore;
  private readonly money: BalanceService;
  // How much is still reserved per live order (after fills / unlocks). 
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
    // only GTC / IOC / FOK supported right now
    if (
      order.timeInForce !== TimeInForce.GTC &&
      order.timeInForce !== TimeInForce.IOC &&
      order.timeInForce !== TimeInForce.FOK
    ) {
      return this.reject(order, "UNSUPPORTED_TIF");
    }

    // reserve funds before touching the book
    try {
      this.lockOrder(order);
    } catch (err) {
      if (err instanceof InsufficientBalanceError) {
        return this.reject(order, "INSUFFICIENT_BALANCE");
      }
      throw err;
    }

    // FOK: all-or-nothing — check before mutating the book
    if (order.timeInForce === TimeInForce.FOK && !this.canFullyFill(order, book)) {
      this.unlockOrder(order);
      return this.reject(order, "FOK_INSUFFICIENT_LIQUIDITY");
    }

    const takerFrom = order.status;

    // cross against resting liquidity
    const { trades, taker } = this.matcher.match(order, book);

    // settle balances + FILL events for every trade
    this.settleAndLogFills(trades, book, taker);

    // taker status after match (OPEN / PARTIAL / FILLED)
    this.logStatus(taker, takerFrom);

    // what to do with unfilled size
    if (remaining(taker) > 0) {
      if (taker.timeInForce === TimeInForce.GTC) {
        // rest leftover as a maker (remaining lock stays)
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
        // immediate-or-cancel: never rest release unused lock
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
      // FOK should not reach here with leftover (precheck passed)
    } else {
      // fully filled — tracked lock should already be zero from settles
      this.locks.delete(taker.orderId);
    }

    this.store.upsert(taker);
    return { order: taker, trades, accepted: true };
  }

  // Cancel a resting order (OPEN / PARTIALLY_FILLED). Pulls it off the book, unlocks leftover funds, logs CANCELLED.
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

  private reject(
    order: Order,
    reason: "UNSUPPORTED_TIF" | "FOK_INSUFFICIENT_LIQUIDITY" | "INSUFFICIENT_BALANCE",
  ): PlacementResult {
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
    const { base, quote } = marketAssets(order.market);
    const asset = order.side === Side.BUY ? quote : base;
    const amount = lockAmount(order.side, order.price, remaining(order));
    if (amount <= 0) return;

    const ref: BalanceRef = { refType: "ORDER", refId: order.orderId };
    this.money.lock(order.userId, asset, amount, ref);
    this.locks.set(order.orderId, { asset, amount });
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
      const buyLimit = this.limitPrice(trade.buyOrderId, taker);
      const { buyLockRelease, sellLockRelease } = this.money.settleTrade({
        trade,
        buyLimitPrice: buyLimit,
        base,
        quote,
      });

      this.releaseTrackedLock(trade.buyOrderId, buyLockRelease);
      this.releaseTrackedLock(trade.sellOrderId, sellLockRelease);

      // maker may be fully filled — drop empty lock entry
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

  private limitPrice(orderId: string, taker: Order): number {
    if (taker.orderId === orderId) return taker.price;
    const order = this.store.get(orderId);
    if (!order) {
      throw new Error(`unknown order ${orderId} for settlement`);
    }
    return order.price;
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
    let need = remaining(taker);
    if (need <= 0) return true;

    const levels =
      taker.side === Side.BUY
        ? book.iterateAsksFromBest()
        : book.iterateBidsFromBest();

    for (const level of levels) {
      if (taker.side === Side.BUY && level.price > taker.price) break;
      if (taker.side === Side.SELL && level.price < taker.price) break;

      need -= level.getTotalVolume();
      if (need <= 0) return true;
    }
    return false;
  }
}
