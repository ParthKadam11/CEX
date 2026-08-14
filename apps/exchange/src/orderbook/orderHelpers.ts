import type { Order } from "@cex/exchange-types";
import { transitionAfterFill } from "../order/orderStateMachine.js";

// How much of this order is still unfilled.
export function remaining(order: Order): number {
  return order.quantity - order.filledQuantity;
}

// After filledQuantity changes, move status via the state machine (OPEN / PARTIALLY_FILLED / FILLED).
export function updateStatus(order: Order): void {
  transitionAfterFill(order);
}
