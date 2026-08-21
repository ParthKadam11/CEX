import { describe, expect, it } from "vitest";
import { Side } from "@cex/exchange-types";
import { makeOrder } from "../../helpers.js";
import {
  InvalidOrderTransitionError,
  isTerminal,
  statusFromFills,
  transition,
  transitionAfterFill,
  transitionCancel,
  transitionReject,
} from "../../../src/order/orderStateMachine.js";

function newOrder(orderId: string) {
  const order = makeOrder({ orderId, side: Side.BUY, price: 100, quantity: 1 });
  order.status = "NEW";
  order.filledQuantity = 0;
  return order;
}

describe("orderStateMachine", () => {
  it("NEW can transition to OPEN, FILLED, CANCELLED, REJECTED", () => {
    expect(transition(newOrder("1"), "OPEN").status).toBe("OPEN");

    const filled = newOrder("2");
    filled.filledQuantity = 1;
    expect(transition(filled, "FILLED").status).toBe("FILLED");

    expect(transitionCancel(newOrder("3")).status).toBe("CANCELLED");
    expect(transitionReject(newOrder("4")).status).toBe("REJECTED");
  });

  it("OPEN can partially fill, fill, or cancel", () => {
    const partial = makeOrder({ orderId: "a", side: Side.BUY, price: 100, quantity: 2 });
    partial.status = "OPEN";
    partial.filledQuantity = 1;
    expect(transitionAfterFill(partial).status).toBe("PARTIALLY_FILLED");

    const full = makeOrder({ orderId: "b", side: Side.BUY, price: 100, quantity: 1 });
    full.status = "OPEN";
    full.filledQuantity = 1;
    expect(transitionAfterFill(full).status).toBe("FILLED");

    const cancel = makeOrder({ orderId: "c", side: Side.BUY, price: 100, quantity: 1 });
    cancel.status = "OPEN";
    expect(transitionCancel(cancel).status).toBe("CANCELLED");
  });

  it("rejects illegal moves from terminal states", () => {
    const order = makeOrder({ orderId: "t", side: Side.BUY, price: 100, quantity: 1 });
    order.status = "FILLED";
    expect(() => transition(order, "OPEN")).toThrow(InvalidOrderTransitionError);
    expect(isTerminal("FILLED")).toBe(true);
  });

  it("statusFromFills mirrors remaining qty", () => {
    const order = makeOrder({ orderId: "s", side: Side.BUY, price: 100, quantity: 10 });
    expect(statusFromFills(order)).toBe("OPEN");
    order.filledQuantity = 3;
    expect(statusFromFills(order)).toBe("PARTIALLY_FILLED");
    order.filledQuantity = 10;
    expect(statusFromFills(order)).toBe("FILLED");
  });

  it("PARTIALLY_FILLED can stay partial then fill", () => {
    const order = makeOrder({ orderId: "p", side: Side.BUY, price: 100, quantity: 5 });
    order.status = "PARTIALLY_FILLED";
    order.filledQuantity = 2;
    expect(transitionAfterFill(order).status).toBe("PARTIALLY_FILLED");

    order.filledQuantity = 5;
    expect(transitionAfterFill(order).status).toBe("FILLED");
  });
});
