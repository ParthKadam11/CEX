import type { AppOrderEvent } from "@cex/app-contracts";
import type {
  FundingEvent,
  LiquidationEvent,
  Order,
  OrderEvent,
  Position,
} from "@cex/exchange-types";

export function toAppOrderEvent(event: OrderEvent): AppOrderEvent | null {
  if (event.type === "STATUS") return null;

  return {
    eventId: `exchange-${event.seq}-${event.orderId}-${event.type}`,
    type: event.type,
    userId: event.userId,
    market: event.market,
    orderId: event.orderId,
    status: event.status,
    reason: event.reason,
    engineSequence: event.seq,
    fills:
      event.type === "FILL" && event.tradeId && event.price && event.quantity
        ? [
            {
              tradeId: event.tradeId,
              price: event.price,
              quantity: event.quantity,
            },
          ]
        : undefined,
    timestamp: event.timestamp,
  };
}

// Status/fill sync from an order snapshot when the event log was overrun.
export function toAppOrderSnapshotEvent(order: Order): AppOrderEvent {
  const type =
    order.status === "CANCELLED"
      ? "CANCELLED"
      : order.status === "REJECTED"
        ? "REJECTED"
        : order.filledQuantity > 0
          ? "FILL"
          : order.status === "OPEN" || order.status === "PARTIALLY_FILLED"
            ? "RESTING"
            : order.status === "FILLED"
              ? "FILL"
              : "RESTING";

  return {
    eventId: `reconcile-order-${order.orderId}-${order.status}-${order.filledQuantity}`,
    type,
    userId: order.userId,
    market: order.market,
    orderId: order.orderId,
    status: order.status,
    order,
    timestamp: order.timestamp || Date.now(),
  };
}

export function toAppPositionEvent(position: Position): AppOrderEvent {
  return {
    eventId: `position-${position.userId}-${position.market}-${position.updatedAt}`,
    type: "POSITION",
    userId: position.userId,
    market: position.market,
    position: {
      size: position.size,
      entryPrice: position.entryPrice,
      margin: position.margin,
      leverage: position.leverage,
      updatedAt: position.updatedAt,
    },
    timestamp: position.updatedAt || Date.now(),
  };
}

export function toAppLiquidationEvent(
  liquidation: LiquidationEvent,
): AppOrderEvent {
  return {
    eventId: `liquidation-${liquidation.userId}-${liquidation.market}-${liquidation.timestamp}`,
    type: "LIQUIDATION",
    userId: liquidation.userId,
    market: liquidation.market,
    reason: liquidation.reason,
    liquidation: {
      size: liquidation.size,
      entryPrice: liquidation.entryPrice,
      mark: liquidation.mark,
      realizedPnl: liquidation.realizedPnl,
      marginReleased: liquidation.marginReleased,
      reason: liquidation.reason,
      counterpartyUserId: liquidation.counterpartyUserId,
    },
    timestamp: liquidation.timestamp,
  };
}

export function toAppFundingEvent(funding: FundingEvent): AppOrderEvent {
  return {
    eventId: `funding-${funding.userId}-${funding.market}-${funding.timestamp}`,
    type: "FUNDING",
    userId: funding.userId,
    market: funding.market,
    funding: {
      size: funding.size,
      mark: funding.mark,
      fundingRateBps: funding.fundingRateBps,
      payment: funding.payment,
    },
    timestamp: funding.timestamp,
  };
}
