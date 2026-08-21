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
import { OrderPlacementService } from "../placement/orderPlacementService.js";
import { cloneOrder } from "../journal/cloneOrder.js";
import { FileWal } from "../journal/fileWal.js";
import type { EventBus } from "../api/eventBus.js";

/*
  MarketRuntime = one in-memory market + durable command WAL.

  Live:  CREDIT / PLACE / CANCEL mutate RAM, then append + fsync.
  Boot:  empty RAM, replay the file, same book / balances / orders.
  Optional EventBus: live order events + BBO for SSE (not during replay).
*/

export class MarketRuntime {
  readonly book: OrderBook;
  readonly placement: OrderPlacementService;
  private replaying = false;

  constructor(
    readonly market: MarketSymbol,
    private readonly wal: FileWal,
    private readonly bus?: EventBus,
  ) {
    this.book = new OrderBook(market);
    this.placement = new OrderPlacementService();

    this.placement.eventLog.onAppend((event) => {
      if (this.replaying || !this.bus) return;
      this.bus.publish({ kind: "ORDER", market: this.market, event });
    });
  }

  static open(
    market: MarketSymbol,
    walPath: string,
    bus?: EventBus,
  ): MarketRuntime {
    const runtime = new MarketRuntime(market, new FileWal(walPath), bus);
    runtime.replay();
    return runtime;
  }

  get queries() {
    return this.placement.queries;
  }

  get balances() {
    return this.placement.balances;
  }

  credit(userId: string, asset: AssetId, amount: number) {
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

  place(order: Order): PlacementResult {
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

  cancel(orderId: string): CancelResult {
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

  private publishBbo(): void {
    if (this.replaying || !this.bus) return;
    const bbo = this.book.getBbo();
    this.bus.publish({
      kind: "BBO",
      market: this.market,
      bestBid: bbo.bestBid,
      bestAsk: bbo.bestAsk,
    });
  }

  private persist(command: EngineCommandBody): void {
    if (this.replaying) return;
    this.wal.append(command);
  }

  private replay(): void {
    this.replaying = true;
    try {
      for (const command of this.wal.readAll()) {
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
