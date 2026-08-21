import type { OrderEvent } from "@cex/exchange-types";

// Append-only order history store.

type NewEvent = Omit<OrderEvent, "seq" | "timestamp"> & {
  timestamp?: number;
};

type AppendListener = (event: OrderEvent) => void;

export class OrderEventLog {
  private events: OrderEvent[] = [];
  private seq = 0;
  private readonly listeners = new Set<AppendListener>();

  // Subscribe to new events (used by SSE fan-out).
  onAppend(listener: AppendListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  append(event: NewEvent): OrderEvent {
    this.seq += 1;
    const full: OrderEvent = {
      ...event,
      seq: this.seq,
      timestamp: event.timestamp ?? Date.now(),
    };
    this.events.push(full);
    for (const listener of this.listeners) listener(full);
    return full;
  }

  all(): readonly OrderEvent[] {
    return this.events;
  }

  forOrder(orderId: string): OrderEvent[] {
    return this.events.filter((e) => e.orderId === orderId);
  }

  forUser(userId: string): OrderEvent[] {
    return this.events.filter((e) => e.userId === userId);
  }

  clear(): void {
    this.events = [];
    this.seq = 0;
  }
}
