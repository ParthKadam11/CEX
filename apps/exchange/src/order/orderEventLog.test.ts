import { describe, expect, it } from "vitest";
import { Side, TimeInForce } from "@cex/exchange-types";
import { OrderBook } from "../book/orderBook.js";
import { fund, makeOrder } from "../test/helpers.js";
import { OrderEventLog } from "./orderEventLog.js";
import { OrderPlacementService } from "../placement/orderPlacementService.js";

describe("OrderEventLog", () => {
  it("appends with growing seq and filters by orderId", () => {
    const log = new OrderEventLog();
    log.append({
      type: "REJECTED",
      orderId: "a",
      userId: "u1",
      market: "SOL-USD",
      reason: "UNSUPPORTED_TIF",
    });
    log.append({
      type: "RESTING",
      orderId: "b",
      userId: "u1",
      market: "SOL-USD",
    });
    log.append({
      type: "FILL",
      orderId: "a",
      userId: "u1",
      market: "SOL-USD",
      quantity: 1,
    });

    expect(log.all()).toHaveLength(3);
    expect(log.all()[0]?.seq).toBe(1);
    expect(log.all()[2]?.seq).toBe(3);
    expect(log.forOrder("a").map((e) => e.type)).toEqual(["REJECTED", "FILL"]);
  });
});

describe("OrderPlacementService event log", () => {
  it("logs REJECTED for unsupported TIF", () => {
    const book = new OrderBook("SOL-USD");
    const service = new OrderPlacementService();
    const order = makeOrder({
      orderId: "b1",
      side: Side.BUY,
      price: 100,
      quantity: 1,
      timeInForce: TimeInForce.FOK_BUDGET,
      quoteBudget: 100,
    });

    service.place(order, book);

    const events = service.eventLog.forOrder("b1");
    expect(events.map((e) => e.type)).toEqual(["REJECTED"]);
    expect(events.find((e) => e.type === "REJECTED")?.reason).toBe(
      "UNSUPPORTED_TIF",
    );
    expect(events[0]?.fromStatus).toBe("NEW");
    expect(events[0]?.status).toBe("REJECTED");
  });

  it("logs FILL + RESTING for GTC partial fill", () => {
    const book = new OrderBook("SOL-USD");
    const service = new OrderPlacementService();
    fund(service, "seller", { SOL: 2 });
    fund(service, "buyer", { USD: 500 });

    service.place(
      makeOrder({
        orderId: "s1",
        side: Side.SELL,
        price: 100,
        quantity: 2,
        userId: "seller",
      }),
      book,
    );
    service.place(
      makeOrder({
        orderId: "b1",
        side: Side.BUY,
        price: 100,
        quantity: 5,
        userId: "buyer",
        timeInForce: TimeInForce.GTC,
      }),
      book,
    );

    const buyEvents = service.eventLog.forOrder("b1");
    expect(buyEvents.some((e) => e.type === "FILL")).toBe(true);
    expect(buyEvents.some((e) => e.type === "RESTING")).toBe(true);
    expect(buyEvents.find((e) => e.type === "RESTING")?.quantity).toBe(3);

    const sellEvents = service.eventLog.forOrder("s1");
    expect(sellEvents.some((e) => e.type === "FILL")).toBe(true);
  });

  it("logs CANCELLED for IOC leftover", () => {
    const book = new OrderBook("SOL-USD");
    const service = new OrderPlacementService();
    fund(service, "seller", { SOL: 1 });
    fund(service, "buyer", { USD: 300 });

    service.place(
      makeOrder({
        orderId: "s1",
        side: Side.SELL,
        price: 100,
        quantity: 1,
        userId: "seller",
      }),
      book,
    );
    service.place(
      makeOrder({
        orderId: "b1",
        side: Side.BUY,
        price: 100,
        quantity: 3,
        userId: "buyer",
        timeInForce: TimeInForce.IOC,
      }),
      book,
    );

    const events = service.eventLog.forOrder("b1");
    expect(events.some((e) => e.type === "FILL")).toBe(true);
    expect(events.some((e) => e.type === "CANCELLED")).toBe(true);
    expect(
      events.some((e) => e.type === "STATUS" && e.toStatus === "CANCELLED"),
    ).toBe(false);
    expect(events.some((e) => e.type === "RESTING")).toBe(false);
  });

  it("logs REJECTED for FOK without enough liquidity", () => {
    const book = new OrderBook("SOL-USD");
    const service = new OrderPlacementService();
    fund(service, "seller", { SOL: 1 });
    fund(service, "buyer", { USD: 500 });

    service.place(
      makeOrder({
        orderId: "s1",
        side: Side.SELL,
        price: 100,
        quantity: 1,
        userId: "seller",
      }),
      book,
    );
    service.place(
      makeOrder({
        orderId: "b1",
        side: Side.BUY,
        price: 100,
        quantity: 5,
        userId: "buyer",
        timeInForce: TimeInForce.FOK,
      }),
      book,
    );

    const events = service.eventLog.forOrder("b1");
    expect(events.map((e) => e.type)).toEqual(["REJECTED"]);
    expect(events.find((e) => e.type === "REJECTED")?.reason).toBe(
      "FOK_INSUFFICIENT_LIQUIDITY",
    );
    expect(events.some((e) => e.type === "FILL")).toBe(false);
  });
});
