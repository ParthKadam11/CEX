import { OrderType, Side, TimeInForce, type AssetId, type Order } from "@cex/exchange-types";
import { remaining } from "../src/order/orderHelpers.js";
import type { OrderPlacementService } from "../src/placement/orderPlacementService.js";

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

/** Credit assets so place() can lock funds. */
export function fund(
  service: OrderPlacementService,
  userId: string,
  amounts: Partial<Record<AssetId, number>>,
): void {
  for (const [asset, amount] of Object.entries(amounts) as [AssetId, number][]) {
    if (amount > 0) service.balances.credit(userId, asset, amount);
  }
}

export { remaining };
