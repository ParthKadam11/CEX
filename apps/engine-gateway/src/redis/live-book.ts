import type { MarketSymbol, OrderBookSnapshot } from "@cex/exchange-types";
import type { EngineRegistry } from "../engine/registry.js";
import type { MarketDataHub } from "./market-data.js";
import { log } from "../logger.js";

export type BookHandler = (book: OrderBookSnapshot) => void;

/**
 * Coalesces market-data signals into shared order-book snapshots for SSE clients.
 * Without this, streams only get BBO tops and UIs never see depth changes.
 */
export class LiveBookHub {
  private readonly handlers = new Set<BookHandler>();
  private readonly timers = new Map<MarketSymbol, ReturnType<typeof setTimeout>>();
  private readonly inFlight = new Set<MarketSymbol>();
  private readonly again = new Set<MarketSymbol>();
  private unsubscribeMarket: (() => void) | null = null;
  private readonly latest = new Map<MarketSymbol, OrderBookSnapshot>();

  constructor(
    private readonly engines: EngineRegistry,
    private readonly marketData: MarketDataHub,
    private readonly coalesceMs = 40,
  ) {}

  start(): void {
    if (this.unsubscribeMarket) return;
    this.unsubscribeMarket = this.marketData.subscribe((message) => {
      this.scheduleRefresh(message.market);
    });
    for (const market of this.engines.markets()) {
      this.scheduleRefresh(market);
    }
  }

  /** Immediate refresh signal from local engine SSE (faster than Redis round-trip). */
  notify(market: MarketSymbol): void {
    this.scheduleRefresh(market);
  }

  subscribe(handler: BookHandler): () => void {
    this.handlers.add(handler);
    for (const book of this.latest.values()) {
      try {
        handler(book);
      } catch {
        // ignore subscriber errors
      }
    }
    for (const market of this.engines.markets()) {
      if (!this.latest.has(market)) this.scheduleRefresh(market);
    }
    return () => this.handlers.delete(handler);
  }

  async close(): Promise<void> {
    this.unsubscribeMarket?.();
    this.unsubscribeMarket = null;
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    this.handlers.clear();
  }

  private scheduleRefresh(market: MarketSymbol): void {
    if (!this.engines.has(market)) return;
    if (this.timers.has(market)) return;
    this.timers.set(
      market,
      setTimeout(() => {
        this.timers.delete(market);
        void this.refresh(market);
      }, this.coalesceMs),
    );
  }

  private async refresh(market: MarketSymbol): Promise<void> {
    if (this.inFlight.has(market)) {
      this.again.add(market);
      return;
    }
    this.inFlight.add(market);
    try {
      const book = await this.engines.get(market).book();
      this.latest.set(market, book);
      for (const handler of this.handlers) {
        try {
          handler(book);
        } catch (error) {
          log("warn", "book subscriber failed", {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    } catch (error) {
      log("warn", "live book refresh failed", {
        market,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.inFlight.delete(market);
      if (this.again.has(market)) {
        this.again.delete(market);
        this.scheduleRefresh(market);
      }
    }
  }
}
