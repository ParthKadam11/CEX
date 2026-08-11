import type { Order } from "@cex/exchange-types";
import { remaining, updateStatus } from "./orderHelpers.js";

/*
  PriceLevel = all resting orders at ONE price (e.g. all bids at 100).

  methods:
    addOrder(order)       — append to FIFO queue (newest at the end)
    peekFirst()           — next order to match (oldest)
    removeOrder(orderId)  — cancel by id (may be middle of queue)
    applyFill(qty)        — fill from the front of the queue
    getTotalVolume()      — sum of remaining qty at this price
    getOrderCount()
    isEmpty()
*/

export class PriceLevel {
  readonly price: number;
  private orders: Order[] = [];
  private totalVolume = 0;

  constructor(price: number) {
    this.price = price;
  }

  // add to end of queue (time priority)
  addOrder(order: Order): void {
    this.orders.push(order);
    this.totalVolume += remaining(order);
  }

  // oldest resting order at this price
  peekFirst(): Order | undefined {
    return this.orders[0];
  }

  // cancel / remove by orderId
  removeOrder(orderId: string): boolean {
    const i = this.orders.findIndex((o) => o.orderId === orderId);
    if (i === -1) return false;
    this.totalVolume -= remaining(this.orders[i]!);
    this.orders.splice(i, 1);
    return true;
  }

  // fill against the front of the queue; drop order if fully filled
  applyFill(qty: number): Order {
    const order = this.orders[0];
    if (!order) throw new Error("empty price level");

    order.filledQuantity += qty;
    this.totalVolume -= qty;
    updateStatus(order);

    // fully filled → leave the queue
    if (remaining(order) <= 0) this.orders.shift();
    return order;
  }

  getTotalVolume(): number {
    return this.totalVolume;
  }

  getOrderCount(): number {
    return this.orders.length;
  }

  isEmpty(): boolean {
    return this.orders.length === 0;
  }
}
