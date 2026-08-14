import { OrderType, Side, TimeInForce, type Order } from "@cex/exchange-types";
import { remaining } from "../orderbook/orderHelpers.js";

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
    status: "NEW",
    timestamp: Date.now(),
    ...partial,
  };
}

export { remaining };
