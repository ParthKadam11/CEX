import type { OrderEvent } from "@cex/exchange-types";

// Append-only order history store.

type NewEvent = Omit<OrderEvent, "seq" | "timestamp"> & {
  timestamp?: number;
};

export class OrderEventLog {
  private events: OrderEvent[] = [];
  private seq = 0;

  append(event: NewEvent): OrderEvent {
    this.seq += 1;
    const full: OrderEvent = {
      ...event,
      seq: this.seq,
      timestamp: event.timestamp ?? Date.now(),
    };
    this.events.push(full);
    return full;
  }

  // Full history in order.
  all(): readonly OrderEvent[] {
    return this.events;
  }

  // History for one order (place → fills → rest/cancel).
  forOrder(orderId: string): OrderEvent[] {
    return this.events.filter((e) => e.orderId === orderId);
  }

  clear(): void {
    this.events = [];
    this.seq = 0;
  }
}
