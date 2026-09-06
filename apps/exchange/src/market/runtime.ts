import type {
  AssetId,
  CancelResult,
  EngineCommand,
  EngineCommandBody,
  FundingEvent,
  LiquidationEvent,
  MarketSymbol,
  Order,
  PlacementResult,
  Trade,
} from "@cex/exchange-types";
import fs from "node:fs";
import { OrderBook } from "../book/orderBook.js";
import {
  OrderPlacementService,
  type RamBounds,
} from "../placement/orderPlacementService.js";
import { cloneOrder } from "../journal/cloneOrder.js";
import { FileWal } from "../journal/fileWal.js";
import {
  loadSnapshot,
  saveSnapshot,
  snapshotPathFor,
  type EngineSnapshot,
} from "../journal/snapshot.js";
import type { EventBus } from "../api/eventBus.js";
import { CommandQueue } from "./commandQueue.js";
import { isPerpMarket, marketSpec } from "./units.js";
import { resolveMarkPrice, type MarkPriceSnapshot } from "../risk/markPrice.js";

export type MarketRuntimeOptions = {
  snapshotEvery?: number;
  maxTerminalOrders?: number;
  maxOrderEvents?: number;
  maxLedgerEntries?: number;
  // 0 disables auto funding timer (tests). Default: marketSpec.fundingIntervalMs.
  fundingIntervalMs?: number;
};

export const DEFAULT_SNAPSHOT_EVERY = 1024;
export const DEFAULT_RAM_BOUNDS: RamBounds = {
  maxTerminalOrders: 10_000,
  maxOrderEvents: 50_000,
  maxLedgerEntries: 20_000,
};

/*
  MarketRuntime = one in-memory market + durable command WAL + snapshots.

  Live: HTTP enqueues CREDIT / PLACE / CANCEL. The queue matches serially,
  appends WAL lines, then one fsync for the batch; the HTTP handler awaits that.
  Boot: load snapshot (if any), replay only the WAL tail.
  Checkpoint: prune RAM indexes, persist snapshot, truncate WAL to the tail.
  Optional EventBus: live order events + BBO for SSE (not during replay).
*/

export class MarketRuntime {
  readonly book: OrderBook;
  readonly placement: OrderPlacementService;
  private replaying = false;
  private snapshotSeq = 0;
  private readonly snapshotPath: string;
  private readonly snapshotEvery: number;
  private readonly ramBounds: RamBounds;
  private readonly queue: CommandQueue;
  private fundingTimer: ReturnType<typeof setInterval> | null = null;
  private readonly fundingIntervalMs: number;

  constructor(
    readonly market: MarketSymbol,
    private readonly wal: FileWal,
    private readonly bus?: EventBus,
    opts: MarketRuntimeOptions = {},
    snapshotPath?: string,
  ) {
    this.book = new OrderBook(market);
    this.placement = new OrderPlacementService();
    this.snapshotPath = snapshotPath ?? "";
    this.snapshotEvery = opts.snapshotEvery ?? DEFAULT_SNAPSHOT_EVERY;
    this.ramBounds = {
      maxTerminalOrders:
        opts.maxTerminalOrders ?? DEFAULT_RAM_BOUNDS.maxTerminalOrders,
      maxOrderEvents: opts.maxOrderEvents ?? DEFAULT_RAM_BOUNDS.maxOrderEvents,
      maxLedgerEntries:
        opts.maxLedgerEntries ?? DEFAULT_RAM_BOUNDS.maxLedgerEntries,
    };
    this.fundingIntervalMs =
      opts.fundingIntervalMs ??
      marketSpec(market).fundingIntervalMs ??
      0;
    this.queue = new CommandQueue(() => this.wal.flush());

    this.placement.eventLog.onAppend((event) => {
      if (this.replaying || !this.bus) return;
      this.bus.publish({ kind: "ORDER", market: this.market, event });
    });
    this.placement.onPositionUpdate((position) => {
      if (this.replaying || !this.bus) return;
      this.bus.publish({ kind: "POSITION", market: this.market, position });
    });
    this.placement.onLiquidation((liquidation) => {
      if (this.replaying || !this.bus) return;
      this.bus.publish({
        kind: "LIQUIDATION",
        market: this.market,
        liquidation,
      });
    });
    this.placement.onFunding((funding) => {
      if (this.replaying || !this.bus) return;
      this.bus.publish({ kind: "FUNDING", market: this.market, funding });
    });
  }

  static open(
    market: MarketSymbol,
    walPath: string,
    bus?: EventBus,
    opts: MarketRuntimeOptions = {},
  ): MarketRuntime {
    const snapshotPath = snapshotPathFor(walPath);
    const snapshot = loadSnapshot(snapshotPath);
    const wal = new FileWal(walPath);
    const runtime = new MarketRuntime(market, wal, bus, opts, snapshotPath);
    runtime.replay(snapshot?.walSeq ?? 0, snapshot);
    runtime.startFundingTimer();
    return runtime;
  }

  get queries() {
    return this.placement.queries;
  }

  get balances() {
    return this.placement.balances;
  }

  get positions() {
    return this.placement.positions;
  }

  markPrice(): MarkPriceSnapshot {
    return resolveMarkPrice(this.book, this.placement.getLastTradePrice());
  }

  credit(userId: string, asset: AssetId, amount: number) {
    return this.enqueue(() => this.creditNow(userId, asset, amount));
  }

  place(order: Order): Promise<PlacementResult> {
    return this.enqueue(() => this.placeNow(order));
  }

  cancel(orderId: string): Promise<CancelResult> {
    return this.enqueue(() => this.cancelNow(orderId));
  }

  // Settle funding for all open positions at current mark (perp only).
  settleFunding(): Promise<FundingEvent[]> {
    return this.enqueue(() => this.settleFundingNow());
  }

  fundingInfo(): {
    market: MarketSymbol;
    fundingRateBps: number | null;
    fundingIntervalMs: number;
    mark: number | null;
  } {
    const spec = marketSpec(this.market);
    return {
      market: this.market,
      fundingRateBps: spec.fundingRateBps ?? null,
      fundingIntervalMs: this.fundingIntervalMs,
      mark: this.markPrice().mark,
    };
  }

  //Dev-only: wipe book, balances, order indexes, WAL, and snapshot. Market is empty afterward (users must re-credit).
  hardReset(): Promise<void> {
    return this.enqueue(() => {
      this.book.clear();
      const empty: EngineSnapshot = {
        version: 2,
        market: this.market,
        walSeq: 0,
        tradeSeq: 0,
        eventSeq: 0,
        ledgerSeq: 0,
        balances: [],
        orders: [],
        events: [],
        ledger: [],
        positions: [],
      };
      this.placement.restoreSnapshot(empty, this.book);
      this.wal.wipe();
      this.snapshotSeq = 0;
      if (this.snapshotPath && fs.existsSync(this.snapshotPath)) {
        fs.rmSync(this.snapshotPath, { force: true });
      }
      this.publishBbo();
    });
  }

  // Persist live state, drop WAL history through this seq, prune RAM indexes. 
  checkpoint(): Promise<void> {
    return this.enqueue(() => {
      this.checkpointNow();
    });
  }

  async close(): Promise<void> {
    this.stopFundingTimer();
    await this.enqueue(() => undefined);
    this.wal.close();
  }

  private startFundingTimer(): void {
    this.stopFundingTimer();
    if (!isPerpMarket(this.market) || this.fundingIntervalMs <= 0) return;
    this.fundingTimer = setInterval(() => {
      void this.settleFunding().catch(() => undefined);
    }, this.fundingIntervalMs);
    if (typeof this.fundingTimer.unref === "function") {
      this.fundingTimer.unref();
    }
  }

  private stopFundingTimer(): void {
    if (this.fundingTimer) {
      clearInterval(this.fundingTimer);
      this.fundingTimer = null;
    }
  }

  private creditNow(userId: string, asset: AssetId, amount: number) {
    const result = this.placement.balances.credit(userId, asset, amount);
    this.persist({
      type: "CREDIT",
      userId,
      asset,
      amount,
      timestamp: Date.now(),
    });
    if (!this.replaying && this.bus) {
      this.bus.publish({
        kind: "CREDIT",
        market: this.market,
        userId,
        asset,
        amount,
      });
    }
    return result;
  }

  private placeNow(order: Order): PlacementResult {
    const snapshot = cloneOrder(order);
    const result = this.placement.place(order, this.book);
    this.persist({
      type: "PLACE",
      order: snapshot,
      timestamp: snapshot.timestamp,
    });
    this.publishBbo();
    this.publishTrades(result.trades);
    this.scanLiquidations();
    return result;
  }

  private cancelNow(orderId: string): CancelResult {
    const result = this.placement.cancel(orderId, this.book);
    if (result.cancelled) {
      this.persist({
        type: "CANCEL",
        orderId,
        timestamp: Date.now(),
      });
      this.publishBbo();
      this.scanLiquidations();
    }
    return result;
  }

  // After mark/BBO may have moved: force-close underwater perps at mark.
  private scanLiquidations(): LiquidationEvent[] {
    if (this.replaying || !isPerpMarket(this.market)) return [];
    const mark = this.markPrice().mark;
    if (mark == null) return [];

    const timestamp = Date.now();
    const events = this.placement.scanAndLiquidate(
      this.market,
      mark,
      this.book,
      timestamp,
    );
    for (const event of events) {
      this.persist({
        type: "LIQUIDATE",
        userId: event.userId,
        market: event.market,
        mark: event.mark,
        timestamp: event.timestamp,
      });
    }
    if (events.length > 0) {
      this.publishBbo();
    }
    return events;
  }

  private settleFundingNow(): FundingEvent[] {
    if (this.replaying || !isPerpMarket(this.market)) return [];
    const mark = this.markPrice().mark;
    if (mark == null) return [];
    const fundingRateBps = marketSpec(this.market).fundingRateBps ?? 0;
    if (fundingRateBps === 0) return [];

    const timestamp = Date.now();
    const events = this.placement.settleFunding({
      market: this.market,
      mark,
      fundingRateBps,
      timestamp,
    });
    if (events.length === 0) return [];

    this.persist({
      type: "FUNDING",
      market: this.market,
      mark,
      fundingRateBps,
      payments: events.map((e) => ({
        userId: e.userId,
        payment: e.payment,
      })),
      timestamp,
    });
    return events;
  }

  private checkpointNow(): void {
    if (this.replaying || !this.snapshotPath) return;

    this.placement.pruneRam(this.ramBounds);
    const walSeq = this.wal.currentSeq;
    saveSnapshot(
      this.snapshotPath,
      this.placement.captureSnapshot(this.market, walSeq),
    );
    this.wal.truncateAfter(walSeq);
    this.snapshotSeq = walSeq;
  }

  private publishBbo(): void {
    if (this.replaying || !this.bus) return;
    const bbo = this.book.getBbo();
    this.bus.publish({
      kind: "BBO",
      market: this.market,
      bestBid: bbo.bestBid,
      bestAsk: bbo.bestAsk,
      engineSequence: this.wal.currentSeq,
      timestamp: Date.now(),
    });
  }

  private publishTrades(trades: Trade[]): void {
    if (this.replaying || !this.bus) return;
    for (const trade of trades) {
      this.bus.publish({
        kind: "TRADE",
        market: this.market,
        trade,
      });
    }
  }

  private persist(command: EngineCommandBody): void {
    if (this.replaying) return;
    this.wal.append(command);
    if (
      this.snapshotEvery > 0 &&
      this.wal.currentSeq - this.snapshotSeq >= this.snapshotEvery
    ) {
      this.checkpointNow();
    }
  }

  private enqueue<T>(run: () => T): Promise<T> {
    return this.queue.enqueue(run);
  }

  private replay(
    afterSeq: number,
    snapshot: ReturnType<typeof loadSnapshot>,
  ): void {
    this.replaying = true;
    try {
      if (snapshot) {
        this.placement.restoreSnapshot(snapshot, this.book);
        this.snapshotSeq = snapshot.walSeq;
        this.wal.adoptSeq(snapshot.walSeq);
      }
      for (const command of this.wal.readAfter(afterSeq)) {
        this.apply(command);
      }
    } finally {
      this.replaying = false;
    }
  }

  private apply(command: EngineCommand): void {
    switch (command.type) {
      case "CREDIT":
        this.placement.balances.credit(
          command.userId,
          command.asset,
          command.amount,
        );
        return;
      case "PLACE":
        this.placement.place(cloneOrder(command.order), this.book);
        return;
      case "CANCEL":
        this.placement.cancel(command.orderId, this.book);
        return;
      case "LIQUIDATE":
        this.placement.forceCloseAtMark(
          command.userId,
          command.market,
          command.mark,
          this.book,
          command.timestamp,
        );
        return;
      case "FUNDING":
        this.placement.applyFundingPayments(
          command.market,
          command.payments,
          command.timestamp,
        );
        return;
    }
  }
}
