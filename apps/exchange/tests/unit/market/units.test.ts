import { describe, expect, it } from "vitest";
import { OrderType, Side, TimeInForce } from "@cex/exchange-types";
import {
  lotsForBudget,
  orderUnitsOk,
  quoteNotional,
  UnsafeUnitError,
} from "../../../src/market/units.js";
import { makeOrder } from "../../helpers.js";

describe("integer ticks / lots", () => {
  it("quote notional is ticks × lots", () => {
    expect(quoteNotional(100, 2)).toBe(200);
  });

  it("rejects IEEE floats that look like money", () => {
    expect(() => quoteNotional(0.1 + 0.2, 1)).toThrow(UnsafeUnitError);
  });

  it("market buy budget floors to whole lots", () => {
    expect(lotsForBudget(250, 100)).toBe(2);
    expect(lotsForBudget(50, 120)).toBe(0);
  });

  it("orderUnitsOk accepts integer limit orders and rejects fractions", () => {
    const ok = makeOrder({
      orderId: "b1",
      side: Side.BUY,
      price: 100,
      quantity: 1,
    });
    expect(orderUnitsOk(ok)).toBe(true);

    const floatPrice = makeOrder({
      orderId: "b2",
      side: Side.BUY,
      price: 100.5,
      quantity: 1,
    });
    expect(orderUnitsOk(floatPrice)).toBe(false);

    const market = makeOrder({
      orderId: "b3",
      side: Side.BUY,
      price: 0,
      quantity: 1,
      type: OrderType.MARKET,
      timeInForce: TimeInForce.IOC,
      quoteBudget: 100,
    });
    expect(orderUnitsOk(market)).toBe(true);
  });
});
