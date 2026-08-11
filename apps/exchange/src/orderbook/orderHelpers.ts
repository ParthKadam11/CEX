import type { Order } from "@cex/exchange-types";

// Remaining Orders. 
export function remaining(order: Order): number {
  return order.quantity - order.filledQuantity;
}

// Sets OPEN / PARTIALLY_FILLED / FILLED from filledQuantity.
export function updateStatus(order: Order): void {
  if (remaining(order) <= 0) {
    order.status = "FILLED";
  } else if (order.filledQuantity > 0) {
    order.status = "PARTIALLY_FILLED";
  } else {
    order.status = "OPEN";
  }
}
