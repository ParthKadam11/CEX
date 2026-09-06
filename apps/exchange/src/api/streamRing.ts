import type {
  ExchangeStreamEvent,
  ExchangeStreamEventBody,
} from "@cex/exchange-types";

export const DEFAULT_STREAM_RING_CAPACITY = 4096;

export type StreamCatchUp = {
  events: ExchangeStreamEvent[];
  // True when afterSeq+1 is older than the ring (some events were evicted).
  gap: boolean;
  oldestSeq: number | null;
  latestSeq: number;
};

// Bounded in-memory ring of sequenced SSE events for reconnect catch-up.
export class StreamRing {
  private readonly buf: ExchangeStreamEvent[] = [];
  private nextSeq = 1;
  private readonly capacity: number;

  constructor(capacity = DEFAULT_STREAM_RING_CAPACITY) {
    if (!Number.isSafeInteger(capacity) || capacity < 1) {
      throw new Error("stream ring capacity must be a positive integer");
    }
    this.capacity = capacity;
  }

  get latestSeq(): number {
    return this.nextSeq - 1;
  }

  get oldestSeq(): number | null {
    return this.buf[0]?.streamSeq ?? null;
  }

  push(body: ExchangeStreamEventBody): ExchangeStreamEvent {
    const event: ExchangeStreamEvent = {
      ...body,
      streamSeq: this.nextSeq,
    };
    this.nextSeq += 1;
    this.buf.push(event);
    while (this.buf.length > this.capacity) {
      this.buf.shift();
    }
    return event;
  }

  // Return events with streamSeq > afterSeq.
  readAfter(afterSeq: number): StreamCatchUp {
    const latestSeq = this.latestSeq;
    if (!Number.isSafeInteger(afterSeq) || afterSeq < 0) {
      return {
        events: [],
        gap: false,
        oldestSeq: this.oldestSeq,
        latestSeq,
      };
    }

    const oldestSeq = this.oldestSeq;
    if (oldestSeq == null) {
      return {
        events: [],
        gap: afterSeq > 0 && afterSeq < latestSeq,
        oldestSeq: null,
        latestSeq,
      };
    }

    const wantFirst = afterSeq + 1;
    const gap = wantFirst < oldestSeq;
    const events = this.buf.filter((event) => event.streamSeq > afterSeq);
    return { events, gap, oldestSeq, latestSeq };
  }
}
