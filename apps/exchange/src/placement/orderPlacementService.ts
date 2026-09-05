import {
  OrderType,
  Side,
  TimeInForce,
  type AssetId,
  type CancelResult,
  type Order,
  type PlacementResult,
  type Position,
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
import { lockForOrder, marginForFill, marketAssets } from "../market/assets.js";
import {
  isPerpMarket,
  lotsForBudget,
  orderUnitsOk,
  quoteNotional,
  resolveLeverage,
} from "../market/units.js";
import { cloneOrder } from "../journal/cloneOrder.js";
import type { EngineSnapshot } from "../journal/snapshot.js";
import { PositionStore } from "../position/positionStore.js";
import { applyPerpFill } from "../position/perpSettlement.js";

type OrderLock = { asset: AssetId; amount: number };

export type RamBounds = {
  maxTerminalOrders: number;
  maxOrderEvents: number;
  maxLedgerEntries: number;
};

/*
  OrderPlacementService = TimeInForce + balances + order event log + order store.

  MatchingEngine only crosses orders. This class:
    - locks funds before matching
    - settles balances on each trade (spot delivery or perp positions)
    - unlocks leftovers (IOC / MARKET leftover / FOK reject / user cancel)
    - records order events and keeps OrderStore in sync

  Call place() one-at-a-time per market (no concurrent book mutation).
*/

export class OrderPlacementService {
  private readonly matcher: MatchingEngine;
  private readonly log: OrderEventLog;
  private readonly store: OrderStore;
  private readonly money: BalanceService;
  private readonly positionStore: PositionStore;
  // How much is still reserved per live order (after fills / unlocks).
  private readonly locks = new Map<string, OrderLock>();
  private readonly positionHandlers: Array<(position: Position) => void> = [];
  readonly queries: OrderQueryService;

  constructor(
    matcher = new MatchingEngine(),
    log = new OrderEventLog(),
    store = new OrderStore(),
    money = new BalanceService(),
    positionStore = new PositionStore(),
  ) {
    this.matcher = matcher;
    this.log = log;
    this.store = store;
    this.money = money;
    this.positionStore = positionStore;
    this.queries = new OrderQueryService(store, log);
  }

  get eventLog(): OrderEventLog {
    return this.log;
  }

  get balances(): BalanceService {
    return this.money;
  }

  get positions(): PositionStore {
    return this.positionStore;
  }

  onPositionUpdate(handler: (position: Position) => void): void {
    this.positionHandlers.push(handler);
  }

  captureSnapshot(
    market: EngineSnapshot["market"],
    walSeq: number,
  ): EngineSnapshot {
    return {
      version: 2,
      market,
      walSeq,
      tradeSeq: this.matcher.getTradeSeq(),
      eventSeq: this.log.currentSeq,
      ledgerSeq: this.money.ledger.currentSeq,
      balances: this.money.balances.listAll(),
      orders: this.store.all().map(cloneOrder),
      events: [...this.log.all()],
      ledger: [...this.money.ledger.all()],
      positions: this.positionStore.listAll(),
    };
  }

  restoreSnapshot(snapshot: EngineSnapshot, book: OrderBook): void {
    this.store.clear();
    this.locks.clear();
    this.positionStore.loadAll(snapshot.positions ?? []);
    this.money.balances.loadAll(snapshot.balances);
    this.money.ledger.replace(snapshot.ledger, snapshot.ledgerSeq);
    this.log.replace(snapshot.events, snapshot.eventSeq);
    this.matcher.setTradeSeq(snapshot.tradeSeq);

    for (const recorded of snapshot.orders) {
      const order = cloneOrder(recorded);
      this.store.upsert(order);
      if (isTerminal(order.status)) continue;
      book.add(order);
      const need = lockForOrder(order);
      if (need && need.amount > 0) {
        this.locks.set(order.orderId, {
          asset: need.asset,
          amount: need.amount,
        });
      }
    }
  }

  pruneRam(bounds: RamBounds): void {
    const terminals = this.store
      .all()
      .filter((order) => isTerminal(order.status))
      .sort(
        (a, b) =>
          a.timestamp - b.timestamp || a.orderId.localeCompare(b.orderId),
      );
    const overflow = terminals.length - bounds.maxTerminalOrders;
    if (overflow > 0) {
      for (const order of terminals.slice(0, overflow)) {
        this.store.remove(order.orderId);
        this.locks.delete(order.orderId);
      }
    }

    const keep = new Set(this.store.all().map((order) => order.orderId));
    this.log.retain(keep);
    this.log.trimOldest(bounds.maxOrderEvents);
    this.money.ledger.trimNewest(bounds.maxLedgerEntries);
  }

  place(order: Order, book: OrderBook): PlacementResult {
    const existing = this.store.get(order.orderId);
    if (existing) {
      this.log.append({
        type: "REJECTED",
        orderId: existing.orderId,
        userId: existing.userId,
        market: existing.market,
        status: existing.status,
        reason: "DUPLICATE_ORDER_ID",
      });
      return {
        order: existing,
        trades: [],
        accepted: false,
        reason: "DUPLICATE_ORDER_ID",
      };
    }

    if (
      order.timeInForce === TimeInForce.FOK_BUDGET &&
      (order.type !== OrderType.MARKET || order.side !== Side.BUY)
    ) {
      return this.reject(order, "FOK_BUDGET_REQUIRES_MARKET_BUY");
    }

    if (
      order.type === OrderType.MARKET &&
      order.side === Side.BUY &&
      !isPerpMarket(order.market) &&
      !(order.quoteBudget && order.quoteBudget > 0)
    ) {
      return this.reject(order, "MARKET_MISSING_QUOTE_BUDGET");
    }

    if (!orderUnitsOk(order)) {
      return this.reject(order, "INVALID_UNITS");
    }

    if (
      order.timeInForce !== TimeInForce.GTC &&
      order.timeInForce !== TimeInForce.IOC &&
      order.timeInForce !== TimeInForce.FOK &&
      order.timeInForce !== TimeInForce.FOK_BUDGET
    ) {
      return this.reject(order, "UNSUPPORTED_TIF");
    }

    if (
      order.timeInForce === TimeInForce.FOK_BUDGET &&
      !this.canFullyFill(order, book)
    ) {
      return this.reject(order, "FOK_INSUFFICIENT_LIQUIDITY");
    }

    try {
      this.lockOrder(order);
    } catch (err) {
      if (err instanceof InsufficientBalanceError) {
        return this.reject(order, "INSUFFICIENT_BALANCE");
      }
      throw err;
    }

    if (
      order.timeInForce === TimeInForce.FOK &&
      !this.canFullyFill(order, book)
    ) {
      this.unlockOrder(order);
      return this.reject(order, "FOK_INSUFFICIENT_LIQUIDITY");
    }

    const takerFrom = order.status;
    const { trades, taker } = this.matcher.match(order, book);

    const positions = this.settleAndLogFills(trades, book, taker);
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
    } else {
      this.locks.delete(taker.orderId);
    }

    this.store.upsert(taker);
    return {
      order: taker,
      trades,
      accepted: true,
      positions: positions.length > 0 ? positions : undefined,
    };
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
    return { order, trades: [], accepted: false, reason };
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
  ): Position[] {
    const touched = new Map<string, Position>();

    for (const trade of trades) {
      if (isPerpMarket(taker.market)) {
        for (const position of this.settlePerpTrade(trade, taker)) {
          touched.set(`${position.userId}:${position.market}`, position);
        }
      } else {
        const { base, quote } = marketAssets(taker.market);
        const buyLimit = this.buyReservePrice(
          trade.buyOrderId,
          taker,
          trade.price,
        );
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
      }

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

    return [...touched.values()];
  }

  private settlePerpTrade(trade: Trade, taker: Order): Position[] {
    const buyOrder = this.orderForFill(trade.buyOrderId, taker);
    const sellOrder = this.orderForFill(trade.sellOrderId, taker);

    return [
      this.settlePerpSide({
        order: buyOrder,
        side: Side.BUY,
        trade,
      }),
      this.settlePerpSide({
        order: sellOrder,
        side: Side.SELL,
        trade,
      }),
    ];
  }

  private settlePerpSide(args: {
    order: Order;
    side: Side;
    trade: Trade;
  }): Position {
    const { order, side, trade } = args;
    const { orderLockRelease, positionMargin, unlockExcess } = marginForFill(
      order,
      trade.quantity,
      trade.price,
    );

    this.releaseTrackedLock(order.orderId, orderLockRelease);
    this.dropEmptyLock(order.orderId);

    if (unlockExcess > 0) {
      this.money.unlock(order.userId, "USD", unlockExcess, {
        refType: "ORDER",
        refId: order.orderId,
      });
    }

    const before = this.positionStore.getOrEmpty(order.userId, order.market);
    const applied = applyPerpFill({
      position: before,
      side,
      quantity: trade.quantity,
      price: trade.price,
      leverage: resolveLeverage(order),
      marginIn: positionMargin,
      timestamp: trade.timestamp,
    });

    if (applied.marginUnlocked > 0) {
      this.money.unlock(order.userId, "USD", applied.marginUnlocked, {
        refType: "POSITION",
        refId: `${order.userId}:${order.market}`,
      });
    }

    if (applied.realizedPnl !== 0) {
      this.money.applyPnl(order.userId, applied.realizedPnl, {
        refType: "TRADE",
        refId: trade.tradeId,
      });
    }

    this.positionStore.set(applied.position);
    for (const handler of this.positionHandlers) {
      handler(applied.position);
    }
    return applied.position;
  }

  private orderForFill(orderId: string, taker: Order): Order {
    if (taker.orderId === orderId) return taker;
    const order = this.store.get(orderId);
    if (!order) {
      throw new Error(`unknown order ${orderId} for settlement`);
    }
    return order;
  }

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

    if (isMarket && taker.side === Side.BUY) {
      let need = remaining(taker);
      let budget = taker.quoteBudget ?? 0;
      if (need <= 0) return true;
      for (const level of book.iterateAsksFromBest()) {
        const take = Math.min(
          need,
          level.getTotalVolume(),
          lotsForBudget(budget, level.price),
        );
        if (take <= 0) break;
        need -= take;
        budget -= quoteNotional(level.price, take);
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
