import type { Order, OrderStatus } from "@cex/exchange-types";

/*
  Order state machine — only legal status changes go through here.

  States:
    NEW               just created, not on book yet
    OPEN              resting on book, nothing filled
    PARTIALLY_FILLED  resting (or still working), some fills
    FILLED            fully filled (terminal)
    CANCELLED         cancelled with or without prior fills (terminal)
    REJECTED          never accepted (terminal)

  Transitions (from → allowed to):
    NEW              → OPEN | PARTIALLY_FILLED | FILLED | CANCELLED | REJECTED
    OPEN             → PARTIALLY_FILLED | FILLED | CANCELLED
    PARTIALLY_FILLED → PARTIALLY_FILLED | FILLED | CANCELLED
    FILLED / CANCELLED / REJECTED → (none)

  Events (why we transition):
    accept   — order accepted; may go OPEN / PARTIAL / FILLED from fill qty
    fill     — after a match updates filledQuantity
    cancel   — user/system cancel
    reject   — invalid / FOK fail / unsupported TIF
*/

const ALLOWED: Record<OrderStatus, readonly OrderStatus[]> = {
  NEW: ["OPEN", "PARTIALLY_FILLED", "FILLED", "CANCELLED", "REJECTED"],
  OPEN: ["PARTIALLY_FILLED", "FILLED", "CANCELLED"],
  PARTIALLY_FILLED: ["PARTIALLY_FILLED", "FILLED", "CANCELLED"],
  FILLED: [],
  CANCELLED: [],
  REJECTED: [],
};

export class InvalidOrderTransitionError extends Error {
  constructor(
    readonly from: OrderStatus,
    readonly to: OrderStatus,
    readonly orderId: string,
  ) {
    super(`Invalid order transition ${from} → ${to} (order ${orderId})`);
    this.name = "InvalidOrderTransitionError";
  }
}

export function isTerminal(status: OrderStatus): boolean {
  return status === "FILLED" || status === "CANCELLED" || status === "REJECTED";
}

//Status implied by how much has been filled (not CANCELLED/REJECTED).
export function statusFromFills(order: Order): OrderStatus {
  const left = order.quantity - order.filledQuantity;
  if (left <= 0) return "FILLED";
  if (order.filledQuantity > 0) return "PARTIALLY_FILLED";
  return "OPEN";
}

//Apply a legal transition. Mutates order.status. Throws InvalidOrderTransitionError if the move is not allowed.

export function transition(order: Order, to: OrderStatus): Order {
  const from = order.status;
  if (from === to) return order;

  if (!ALLOWED[from].includes(to)) {
    throw new InvalidOrderTransitionError(from, to, order.orderId);
  }

  order.status = to;
  return order;
}

//After fills change: NEW/OPEN/PARTIAL → OPEN | PARTIAL | FILLED. 
export function transitionAfterFill(order: Order): Order {
  return transition(order, statusFromFills(order));
}

// Reject before or instead of accepting (usually from NEW). 
export function transitionReject(order: Order): Order {
  return transition(order, "REJECTED");
}

// Cancel resting or working order (OPEN / PARTIAL; also NEW if needed). 
export function transitionCancel(order: Order): Order {
  return transition(order, "CANCELLED");
}
