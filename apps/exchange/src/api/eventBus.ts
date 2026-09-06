import type {
  ExchangeStreamEvent,
  ExchangeStreamEventBody,
} from "@cex/exchange-types";
import {
  DEFAULT_STREAM_RING_CAPACITY,
  StreamRing,
  type StreamCatchUp,
} from "./streamRing.js";

export type { ExchangeStreamEvent, ExchangeStreamEventBody };

type Listener = (event: ExchangeStreamEvent) => void;

// In-process pub/sub + bounded ring for SSE catch-up.
// MarketRuntime publishes live events (not during WAL replay).

export class EventBus {
  private readonly listeners = new Set<Listener>();
  private readonly ring: StreamRing;

  constructor(ringCapacity = DEFAULT_STREAM_RING_CAPACITY) {
    this.ring = new StreamRing(ringCapacity);
  }

  get latestSeq(): number {
    return this.ring.latestSeq;
  }

  get oldestSeq(): number | null {
    return this.ring.oldestSeq;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  publish(event: ExchangeStreamEventBody): ExchangeStreamEvent {
    const sequenced = this.ring.push(event);
    for (const listener of this.listeners) listener(sequenced);
    return sequenced;
  }

  catchUp(afterSeq: number): StreamCatchUp {
    return this.ring.readAfter(afterSeq);
  }
}
