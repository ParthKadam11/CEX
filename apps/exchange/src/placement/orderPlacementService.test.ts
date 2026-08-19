import { describe, expect, it } from "vitest";
import { Side, TimeInForce } from "@cex/exchange-types";
import { OrderBook } from "../book/orderBook.js";
import { fund, makeOrder, remaining } from "../test/helpers.js";
import { OrderPlacementService } from "./orderPlacementService.js";

describe("OrderPlacementService", () => {
  it("GTC: partial fill rests remainder on the book", () => {
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

    const result = service.place(
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

    expect(result.accepted).toBe(true);
    expect(result.trades).toHaveLength(1);
    expect(result.trades[0]?.quantity).toBe(2);
    expect(result.order.status).toBe("PARTIALLY_FILLED");
    expect(remaining(result.order)).toBe(3);
    expect(book.getOrder("b1")).toBeDefined();
    expect(book.getBbo()).toEqual({ bestBid: 100, bestAsk: null });

    // buyer: locked 500, spent 200, still locked 300 for remainder
    expect(service.balances.get("buyer", "USD")).toEqual({
      userId: "buyer",
      asset: "USD",
      available: 0,
      locked: 300,
    });
    expect(service.balances.get("buyer", "SOL").available).toBe(2);
    expect(service.balances.get("seller", "USD").available).toBe(200);
    expect(service.balances.get("seller", "SOL").locked).toBe(0);
  });

  it("GTC: no cross rests full size as maker", () => {
    const book = new OrderBook("SOL-USD");
    const service = new OrderPlacementService();
    fund(service, "seller", { SOL: 2 });
    fund(service, "buyer", { USD: 100 });

    service.place(
      makeOrder({
        orderId: "s1",
        side: Side.SELL,
        price: 101,
        quantity: 2,
        userId: "seller",
      }),
      book,
    );

    const result = service.place(
      makeOrder({
        orderId: "b1",
        side: Side.BUY,
        price: 100,
        quantity: 1,
        userId: "buyer",
        timeInForce: TimeInForce.GTC,
      }),
      book,
    );

    expect(result.accepted).toBe(true);
    expect(result.trades).toHaveLength(0);
    expect(result.order.status).toBe("OPEN");
    expect(book.getOrder("b1")).toBeDefined();
    expect(book.getSnapshot().bids[0]).toEqual({
      price: 100,
      quantity: 1,
      count: 1,
    });
    expect(service.balances.get("buyer", "USD")).toEqual({
      userId: "buyer",
      asset: "USD",
      available: 0,
      locked: 100,
    });
  });

  it("IOC: partial fill cancels leftover and does not rest", () => {
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

    const result = service.place(
      makeOrder({
        orderId: "b1",
        side: Side.BUY,
        price: 100,
        quantity: 5,
        userId: "buyer",
        timeInForce: TimeInForce.IOC,
      }),
      book,
    );

    expect(result.accepted).toBe(true);
    expect(result.trades).toHaveLength(1);
    expect(result.order.filledQuantity).toBe(2);
    expect(result.order.status).toBe("CANCELLED");
    expect(book.getOrder("b1")).toBeUndefined();
    expect(book.getSnapshot().asks).toHaveLength(0);
    expect(book.getSnapshot().bids).toHaveLength(0);

    // leftover lock unlocked
    expect(service.balances.get("buyer", "USD")).toEqual({
      userId: "buyer",
      asset: "USD",
      available: 300,
      locked: 0,
    });
  });

  it("IOC: no fill cancels and leaves book unchanged", () => {
    const book = new OrderBook("SOL-USD");
    const service = new OrderPlacementService();
    fund(service, "seller", { SOL: 2 });
    fund(service, "buyer", { USD: 100 });

    service.place(
      makeOrder({
        orderId: "s1",
        side: Side.SELL,
        price: 101,
        quantity: 2,
        userId: "seller",
      }),
      book,
    );
    const before = book.getSnapshot();

    const result = service.place(
      makeOrder({
        orderId: "b1",
        side: Side.BUY,
        price: 100,
        quantity: 1,
        userId: "buyer",
        timeInForce: TimeInForce.IOC,
      }),
      book,
    );

    expect(result.accepted).toBe(true);
    expect(result.trades).toHaveLength(0);
    expect(result.order.status).toBe("CANCELLED");
    expect(book.getOrder("b1")).toBeUndefined();
    expect(book.getSnapshot()).toEqual(before);
    expect(service.balances.get("buyer", "USD")).toEqual({
      userId: "buyer",
      asset: "USD",
      available: 100,
      locked: 0,
    });
  });

  it("FOK: enough liquidity fully fills", () => {
    const book = new OrderBook("SOL-USD");
    const service = new OrderPlacementService();
    fund(service, "s1", { SOL: 1 });
    fund(service, "s2", { SOL: 2 });
    fund(service, "buyer", { USD: 303 });

    service.place(
      makeOrder({
        orderId: "s1",
        side: Side.SELL,
        price: 100,
        quantity: 1,
        userId: "s1",
      }),
      book,
    );
    service.place(
      makeOrder({
        orderId: "s2",
        side: Side.SELL,
        price: 101,
        quantity: 2,
        userId: "s2",
      }),
      book,
    );

    const result = service.place(
      makeOrder({
        orderId: "b1",
        side: Side.BUY,
        price: 101,
        quantity: 3,
        userId: "buyer",
        timeInForce: TimeInForce.FOK,
      }),
      book,
    );

    expect(result.accepted).toBe(true);
    expect(result.trades).toHaveLength(2);
    expect(result.order.status).toBe("FILLED");
    expect(remaining(result.order)).toBe(0);
    expect(book.getOrder("b1")).toBeUndefined();
    expect(book.getSnapshot().asks).toHaveLength(0);

    // locked 303, paid 100+202=302, unlocked 1 improvement on first fill (limit 101 vs 100)
    expect(service.balances.get("buyer", "USD")).toEqual({
      userId: "buyer",
      asset: "USD",
      available: 1,
      locked: 0,
    });
    expect(service.balances.get("buyer", "SOL").available).toBe(3);
  });

  it("FOK: insufficient liquidity rejects without mutating book", () => {
    const book = new OrderBook("SOL-USD");
    const service = new OrderPlacementService();
    fund(service, "s1", { SOL: 1 });
    fund(service, "s2", { SOL: 1 });
    fund(service, "buyer", { USD: 505 });

    service.place(
      makeOrder({
        orderId: "s1",
        side: Side.SELL,
        price: 100,
        quantity: 1,
        userId: "s1",
      }),
      book,
    );
    service.place(
      makeOrder({
        orderId: "s2",
        side: Side.SELL,
        price: 101,
        quantity: 1,
        userId: "s2",
      }),
      book,
    );
    const before = book.getSnapshot();

    const result = service.place(
      makeOrder({
        orderId: "b1",
        side: Side.BUY,
        price: 101,
        quantity: 5,
        userId: "buyer",
        timeInForce: TimeInForce.FOK,
      }),
      book,
    );

    expect(result.accepted).toBe(false);
    expect(result.trades).toHaveLength(0);
    expect(result.order.status).toBe("REJECTED");
    expect(result.order.filledQuantity).toBe(0);
    expect(book.getOrder("b1")).toBeUndefined();
    expect(book.getSnapshot()).toEqual(before);
    // lock released on FOK reject
    expect(service.balances.get("buyer", "USD")).toEqual({
      userId: "buyer",
      asset: "USD",
      available: 505,
      locked: 0,
    });
  });

  it("FOK: price does not cross enough size rejects", () => {
    const book = new OrderBook("SOL-USD");
    const service = new OrderPlacementService();
    fund(service, "s1", { SOL: 2 });
    fund(service, "s2", { SOL: 10 });
    fund(service, "buyer", { USD: 500 });

    service.place(
      makeOrder({
        orderId: "s1",
        side: Side.SELL,
        price: 100,
        quantity: 2,
        userId: "s1",
      }),
      book,
    );
    service.place(
      makeOrder({
        orderId: "s2",
        side: Side.SELL,
        price: 105,
        quantity: 10,
        userId: "s2",
      }),
      book,
    );
    const before = book.getSnapshot();

    const result = service.place(
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

  it("rejects when buyer has insufficient balance", () => {
    const book = new OrderBook("SOL-USD");
    const service = new OrderPlacementService();
    fund(service, "buyer", { USD: 50 });

    const result = service.place(
      makeOrder({
        orderId: "b1",
        side: Side.BUY,
        price: 100,
        quantity: 1,
        userId: "buyer",
      }),
      book,
    );

    expect(result.accepted).toBe(false);
    expect(result.order.status).toBe("REJECTED");
    expect(service.eventLog.forOrder("b1")[0]?.reason).toBe(
      "INSUFFICIENT_BALANCE",
    );
    expect(service.balances.get("buyer", "USD").available).toBe(50);
  });

  it("cancel: resting GTC leaves the book and unlocks funds", () => {
    const book = new OrderBook("SOL-USD");
    const service = new OrderPlacementService();
    fund(service, "buyer", { USD: 100 });

    service.place(
      makeOrder({
        orderId: "b1",
        side: Side.BUY,
        price: 100,
        quantity: 1,
        userId: "buyer",
      }),
      book,
    );

    const result = service.cancel("b1", book);

    expect(result.cancelled).toBe(true);
    expect(result.order?.status).toBe("CANCELLED");
    expect(book.getOrder("b1")).toBeUndefined();
    expect(service.queries.getOpenByUser("buyer")).toEqual([]);
    expect(service.balances.get("buyer", "USD")).toEqual({
      userId: "buyer",
      asset: "USD",
      available: 100,
      locked: 0,
    });
    expect(service.eventLog.forOrder("b1").some((e) => e.type === "CANCELLED")).toBe(
      true,
    );
  });

  it("cancel: partial fill unlocks only the leftover lock", () => {
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
      }),
      book,
    );

    const result = service.cancel("b1", book);

    expect(result.cancelled).toBe(true);
    expect(result.order?.status).toBe("CANCELLED");
    expect(result.order?.filledQuantity).toBe(2);
    expect(book.getOrder("b1")).toBeUndefined();
    expect(service.balances.get("buyer", "USD")).toEqual({
      userId: "buyer",
      asset: "USD",
      available: 300,
      locked: 0,
    });
    expect(service.balances.get("buyer", "SOL").available).toBe(2);
  });

  it("cancel: unknown order is a no-op", () => {
    const book = new OrderBook("SOL-USD");
    const service = new OrderPlacementService();

    expect(service.cancel("missing", book)).toEqual({
      cancelled: false,
      reason: "UNKNOWN_ORDER",
    });
  });

  it("cancel: filled order is not cancellable", () => {
    const book = new OrderBook("SOL-USD");
    const service = new OrderPlacementService();
    fund(service, "seller", { SOL: 1 });
    fund(service, "buyer", { USD: 100 });

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
        quantity: 1,
        userId: "buyer",
      }),
      book,
    );

    const result = service.cancel("s1", book);
    expect(result.cancelled).toBe(false);
    expect(result.reason).toBe("NOT_CANCELLABLE");
    expect(result.order?.status).toBe("FILLED");
    expect(service.balances.get("seller", "SOL").locked).toBe(0);
  });
});

