import { describe, expect, it } from "vitest";
import { Side, TimeInForce } from "@cex/exchange-types";
import { OrderBook } from "../orderbook/orderBook.js";
import { makeOrder, remaining } from "../test/helpers.js";
import { OrderPlacementService } from "./orderPlacementService.js";

describe("OrderPlacementService", () => {
  it("GTC: partial fill rests remainder on the book", () => {
    const book = new OrderBook("SOL-USD");
    const service = new OrderPlacementService();

    book.add(makeOrder({ orderId: "s1", side: Side.SELL, price: 100, quantity: 2 }));
    const order = makeOrder({
      orderId: "b1",
      side: Side.BUY,
      price: 100,
      quantity: 5,
      timeInForce: TimeInForce.GTC,
    });

    const result = service.place(order, book);

    expect(result.accepted).toBe(true);
    expect(result.trades).toHaveLength(1);
    expect(result.trades[0]?.quantity).toBe(2);
    expect(result.order.status).toBe("PARTIALLY_FILLED");
    expect(remaining(result.order)).toBe(3);
    expect(book.getOrder("b1")).toBeDefined();
    expect(book.getBbo()).toEqual({ bestBid: 100, bestAsk: null });
  });

  it("GTC: no cross rests full size as maker", () => {
    const book = new OrderBook("SOL-USD");
    const service = new OrderPlacementService();

    book.add(makeOrder({ orderId: "s1", side: Side.SELL, price: 101, quantity: 2 }));
    const order = makeOrder({
      orderId: "b1",
      side: Side.BUY,
      price: 100,
      quantity: 1,
      timeInForce: TimeInForce.GTC,
    });

    const result = service.place(order, book);

    expect(result.accepted).toBe(true);
    expect(result.trades).toHaveLength(0);
    expect(result.order.status).toBe("OPEN");
    expect(book.getOrder("b1")).toBeDefined();
    expect(book.getSnapshot().bids[0]).toEqual({
      price: 100,
      quantity: 1,
      count: 1,
    });
  });

  it("IOC: partial fill cancels leftover and does not rest", () => {
    const book = new OrderBook("SOL-USD");
    const service = new OrderPlacementService();

    book.add(makeOrder({ orderId: "s1", side: Side.SELL, price: 100, quantity: 2 }));
    const order = makeOrder({
      orderId: "b1",
      side: Side.BUY,
      price: 100,
      quantity: 5,
      timeInForce: TimeInForce.IOC,
    });

    const result = service.place(order, book);

    expect(result.accepted).toBe(true);
    expect(result.trades).toHaveLength(1);
    expect(result.order.filledQuantity).toBe(2);
    expect(result.order.status).toBe("CANCELLED");
    expect(book.getOrder("b1")).toBeUndefined();
    expect(book.getSnapshot().asks).toHaveLength(0);
    expect(book.getSnapshot().bids).toHaveLength(0);
  });

  it("IOC: no fill cancels and leaves book unchanged", () => {
    const book = new OrderBook("SOL-USD");
    const service = new OrderPlacementService();

    book.add(makeOrder({ orderId: "s1", side: Side.SELL, price: 101, quantity: 2 }));
    const before = book.getSnapshot();

    const order = makeOrder({
      orderId: "b1",
      side: Side.BUY,
      price: 100,
      quantity: 1,
      timeInForce: TimeInForce.IOC,
    });

    const result = service.place(order, book);

    expect(result.accepted).toBe(true);
    expect(result.trades).toHaveLength(0);
    expect(result.order.status).toBe("CANCELLED");
    expect(book.getOrder("b1")).toBeUndefined();
    expect(book.getSnapshot()).toEqual(before);
  });

  it("FOK: enough liquidity fully fills", () => {
    const book = new OrderBook("SOL-USD");
    const service = new OrderPlacementService();

    book.add(makeOrder({ orderId: "s1", side: Side.SELL, price: 100, quantity: 1 }));
    book.add(makeOrder({ orderId: "s2", side: Side.SELL, price: 101, quantity: 2 }));
    const order = makeOrder({
      orderId: "b1",
      side: Side.BUY,
      price: 101,
      quantity: 3,
      timeInForce: TimeInForce.FOK,
    });

    const result = service.place(order, book);

    expect(result.accepted).toBe(true);
    expect(result.trades).toHaveLength(2);
    expect(result.order.status).toBe("FILLED");
    expect(remaining(result.order)).toBe(0);
    expect(book.getOrder("b1")).toBeUndefined();
    expect(book.getSnapshot().asks).toHaveLength(0);
  });

  it("FOK: insufficient liquidity rejects without mutating book", () => {
    const book = new OrderBook("SOL-USD");
    const service = new OrderPlacementService();

    book.add(makeOrder({ orderId: "s1", side: Side.SELL, price: 100, quantity: 1 }));
    book.add(makeOrder({ orderId: "s2", side: Side.SELL, price: 101, quantity: 1 }));
    const before = book.getSnapshot();

    const order = makeOrder({
      orderId: "b1",
      side: Side.BUY,
      price: 101,
      quantity: 5,
      timeInForce: TimeInForce.FOK,
    });

    const result = service.place(order, book);

    expect(result.accepted).toBe(false);
    expect(result.trades).toHaveLength(0);
    expect(result.order.status).toBe("REJECTED");
    expect(result.order.filledQuantity).toBe(0);
    expect(book.getOrder("b1")).toBeUndefined();
    expect(book.getSnapshot()).toEqual(before);
  });

  it("FOK: price does not cross enough size rejects", () => {
    const book = new OrderBook("SOL-USD");
    const service = new OrderPlacementService();

    book.add(makeOrder({ orderId: "s1", side: Side.SELL, price: 100, quantity: 2 }));
    book.add(makeOrder({ orderId: "s2", side: Side.SELL, price: 105, quantity: 10 }));
    const before = book.getSnapshot();

    const order = makeOrder({
      orderId: "b1",
      side: Side.BUY,
      price: 100,
      quantity: 5,
      timeInForce: TimeInForce.FOK,
    });

    const result = service.place(order, book);

    expect(result.accepted).toBe(false);
    expect(result.trades).toHaveLength(0);
    expect(result.order.status).toBe("REJECTED");
    expect(book.getSnapshot()).toEqual(before);
  });

  it("rejects unsupported TimeInForce", () => {
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

    const result = service.place(order, book);

    expect(result.accepted).toBe(false);
    expect(result.trades).toHaveLength(0);
    expect(result.order.status).toBe("REJECTED");
  });
});
