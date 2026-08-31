import type {
  AssetId,
  CancelResult,
  EngineCommand,
  EngineCommandBody,
  MarketSymbol,
  Order,
  PlacementResult,
} from "@cex/exchange-types";
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
} from "../journal/snapshot.js";
import type { EventBus } from "../api/eventBus.js";
import { CommandQueue } from "./commandQueue.js";

export type MarketRuntimeOptions = {
  /** Write a snapshot and truncate the WAL every N commands. 0 disables. */
  snapshotEvery?: number;
  maxTerminalOrders?: number;
  maxOrderEvents?: number;
  maxLedgerEntries?: number;
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
    this.queue = new CommandQueue(() => this.wal.flush());

    this.placement.eventLog.onAppend((event) => {
      if (this.replaying || !this.bus) return;
      this.bus.publish({ kind: "ORDER", market: this.market, event });
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
    return runtime;
  }

  get queries() {
    return this.placement.queries;
  }

  get balances() {
    return this.placement.balances;
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

  /** Persist live state, drop WAL history through this seq, prune RAM indexes. */
  checkpoint(): Promise<void> {
    return this.enqueue(() => {
      this.checkpointNow();
    });
  }

  async close(): Promise<void> {
    await this.enqueue(() => undefined);
    this.wal.close();
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
    }
    return result;
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
    }
  }
}
