import type { Order } from "@cex/exchange-types";

// Snapshot an order before place() mutates filledQuantity / status
export function cloneOrder(order: Order): Order {
  return { ...order };
}
