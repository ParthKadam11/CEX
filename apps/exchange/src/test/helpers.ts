import { OrderType, Side, TimeInForce, type Order } from "@cex/exchange-types";

export function makeOrder(
  partial: Pick<Order, "orderId" | "side" | "price" | "quantity"> &
    Partial<Order>,
): Order {
  return {
    userId: "user-1",
    market: "SOL-USD",
    type: OrderType.LIMIT,
    timeInForce: TimeInForce.GTC,
    filledQuantity: 0,
    status: "OPEN",
    timestamp: Date.now(),
    ...partial,
  };
}

export function remaining(order: Order): number {
  return order.quantity - order.filledQuantity;
}
