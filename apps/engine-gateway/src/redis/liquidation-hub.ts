import type { LiquidationEvent } from "@cex/exchange-types";
import { log } from "../logger.js";

export type LiquidationHandler = (liquidation: LiquidationEvent) => void;

// In-process fan-out for engine LIQUIDATION SSE → gateway clients.
export class LiquidationHub {
  private readonly handlers = new Set<LiquidationHandler>();

  publish(liquidation: LiquidationEvent): void {
    for (const handler of this.handlers) {
      try {
        handler(liquidation);
      } catch (error) {
        log("warn", "liquidation subscriber failed", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  subscribe(handler: LiquidationHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }
}
