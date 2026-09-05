import type { Position } from "@cex/exchange-types";
import { log } from "../logger.js";

export type PositionHandler = (position: Position) => void;

/** In-process fan-out for engine POSITION SSE → gateway clients. */
export class PositionHub {
  private readonly handlers = new Set<PositionHandler>();

  publish(position: Position): void {
    for (const handler of this.handlers) {
      try {
        handler(position);
      } catch (error) {
        log("warn", "position subscriber failed", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  subscribe(handler: PositionHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }
}
