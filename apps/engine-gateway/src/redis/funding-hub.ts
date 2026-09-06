import type { FundingEvent } from "@cex/exchange-types";
import { log } from "../logger.js";

export type FundingHandler = (funding: FundingEvent) => void;

// In-process fan-out for engine FUNDING SSE → gateway clients.
export class FundingHub {
  private readonly handlers = new Set<FundingHandler>();

  publish(funding: FundingEvent): void {
    for (const handler of this.handlers) {
      try {
        handler(funding);
      } catch (error) {
        log("warn", "funding subscriber failed", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  subscribe(handler: FundingHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }
}
