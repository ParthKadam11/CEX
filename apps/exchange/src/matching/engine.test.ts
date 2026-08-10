import { describe, expect, it } from "vitest";
import { Side } from "@cex/exchange-types";
import { MatchingEngine } from "./engine.js";
import { OrderBook } from "../orderbook/orderBook.js";
import { makeOrder, remaining } from "../test/helpers.js";

describe("MatchingEngine", () => {
  it("fully fills a buy taker against a resting ask", () => {
    const book = new OrderBook("SOL-USD");
    const engine = new MatchingEngine();

    book.add(makeOrder({ orderId: "s1", side: Side.SELL, price: 101, quantity: 2 }));
    const taker = makeOrder({ orderId: "b1", side: Side.BUY, price: 101, quantity: 1 });

    const { trades, taker: updated } = engine.match(taker, book);

    expect(trades).toHaveLength(1);
    expect(trades[0]?.price).toBe(101);
    expect(trades[0]?.quantity).toBe(1);
    expect(trades[0]?.buyOrderId).toBe("b1");
    expect(trades[0]?.sellOrderId).toBe("s1");
    expect(updated.status).toBe("FILLED");
    expect(remaining(updated)).toBe(0);

    const snapshot = book.getSnapshot();
    expect(snapshot.asks[0]?.quantity).toBe(1);
  });

  it("does not match when buy price is below best ask", () => {
    const book = new OrderBook("SOL-USD");
    const engine = new MatchingEngine();

    book.add(makeOrder({ orderId: "s1", side: Side.SELL, price: 101, quantity: 2 }));
    const taker = makeOrder({ orderId: "b1", side: Side.BUY, price: 100, quantity: 1 });

    const { trades, taker: updated } = engine.match(taker, book);

    expect(trades).toHaveLength(0);
    expect(updated.filledQuantity).toBe(0);
    expect(book.getSnapshot().asks[0]?.quantity).toBe(2);
  });

  it("partially fills taker and leaves resting ask quantity", () => {
    const book = new OrderBook("SOL-USD");
    const engine = new MatchingEngine();

    book.add(makeOrder({ orderId: "s1", side: Side.SELL, price: 100, quantity: 3 }));
    const taker = makeOrder({ orderId: "b1", side: Side.BUY, price: 100, quantity: 5 });

    const { trades, taker: updated } = engine.match(taker, book);

    expect(trades).toHaveLength(1);
    expect(trades[0]?.quantity).toBe(3);
    expect(updated.status).toBe("PARTIALLY_FILLED");
    expect(remaining(updated)).toBe(2);
    expect(book.getSnapshot().asks).toHaveLength(0);
  });

  it("fully fills a sell taker against a resting bid", () => {
    const book = new OrderBook("SOL-USD");
    const engine = new MatchingEngine();

    book.add(makeOrder({ orderId: "b1", side: Side.BUY, price: 99, quantity: 2 }));
    const taker = makeOrder({ orderId: "s1", side: Side.SELL, price: 99, quantity: 1 });

    const { trades, taker: updated } = engine.match(taker, book);

    expect(trades).toHaveLength(1);
    expect(trades[0]?.price).toBe(99);
    expect(trades[0]?.sellOrderId).toBe("s1");
    expect(updated.status).toBe("FILLED");
    expect(book.getSnapshot().bids[0]?.quantity).toBe(1);
  });

  it("matches across multiple ask levels in price order", () => {
    const book = new OrderBook("SOL-USD");
    const engine = new MatchingEngine();

    book.add(makeOrder({ orderId: "s1", side: Side.SELL, price: 100, quantity: 1 }));
    book.add(makeOrder({ orderId: "s2", side: Side.SELL, price: 101, quantity: 1 }));
    const taker = makeOrder({ orderId: "b1", side: Side.BUY, price: 101, quantity: 2 });

    const { trades, taker: updated } = engine.match(taker, book);

    expect(trades).toHaveLength(2);
    expect(trades.map((t) => t.price)).toEqual([100, 101]);
    expect(updated.status).toBe("FILLED");
    expect(book.getSnapshot().asks).toHaveLength(0);
  });

  it("matches FIFO at the same price level", () => {
    const book = new OrderBook("SOL-USD");
    const engine = new MatchingEngine();

    book.add(makeOrder({ orderId: "s1", side: Side.SELL, price: 100, quantity: 1 }));
    book.add(makeOrder({ orderId: "s2", side: Side.SELL, price: 100, quantity: 1 }));
    const taker = makeOrder({ orderId: "b1", side: Side.BUY, price: 100, quantity: 1 });

    const { trades } = engine.match(taker, book);

    expect(trades).toHaveLength(1);
    expect(trades[0]?.sellOrderId).toBe("s1");
    expect(book.getSnapshot().asks[0]?.quantity).toBe(1);
    expect(book.getOrder("s2")?.orderId).toBe("s2");
  });
});
