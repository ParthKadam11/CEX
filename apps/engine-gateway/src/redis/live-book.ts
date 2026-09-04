import type { OrderBookSnapshot } from "@cex/exchange-types";
import type { EngineClient } from "../engine/client.js";
import type { MarketDataHub } from "./market-data.js";
import { log } from "../logger.js";

export type BookHandler = (book: OrderBookSnapshot) => void;

/**
 * Coalesces market-data signals into shared order-book snapshots for SSE clients.
 * Without this, streams only get BBO tops and UIs never see depth changes.
 */
export class LiveBookHub {
  private readonly handlers = new Set<BookHandler>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private refreshInFlight = false;
  private refreshAgain = false;
  private unsubscribeMarket: (() => void) | null = null;
  private latest: OrderBookSnapshot | null = null;

  constructor(
    private readonly engine: EngineClient,
    private readonly marketData: MarketDataHub,
    private readonly coalesceMs = 40,
  ) {}

  start(): void {
    if (this.unsubscribeMarket) return;
    this.unsubscribeMarket = this.marketData.subscribe(() => {
      this.scheduleRefresh();
    });
    this.scheduleRefresh();
  }

  /** Immediate refresh signal from local engine SSE (faster than Redis round-trip). */
  notify(): void {
    this.scheduleRefresh();
  }

  subscribe(handler: BookHandler): () => void {
    this.handlers.add(handler);
    if (this.latest) {
      try {
        handler(this.latest);
      } catch {
        // ignore subscriber errors
      }
    } else {
      this.scheduleRefresh();
    }
    return () => this.handlers.delete(handler);
  }

  async close(): Promise<void> {
    this.unsubscribeMarket?.();
    this.unsubscribeMarket = null;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.handlers.clear();
  }

  private scheduleRefresh(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.refresh();
    }, this.coalesceMs);
  }

  private async refresh(): Promise<void> {
    if (this.refreshInFlight) {
      this.refreshAgain = true;
      return;
    }
    this.refreshInFlight = true;
    try {
      const book = await this.engine.book();
      this.latest = book;
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
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.refreshInFlight = false;
      if (this.refreshAgain) {
        this.refreshAgain = false;
        this.scheduleRefresh();
      }
    }
  }
}
