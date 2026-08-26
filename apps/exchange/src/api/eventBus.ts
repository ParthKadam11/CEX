import type { ExchangeStreamEvent } from "@cex/exchange-types";

export type { ExchangeStreamEvent };

type Listener = (event: ExchangeStreamEvent) => void;

// In-process pub/sub. HTTP SSE handlers subscribe; MarketRuntime publishes after live commands (not during WAL replay).

export class EventBus {
  private readonly listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  publish(event: ExchangeStreamEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}
