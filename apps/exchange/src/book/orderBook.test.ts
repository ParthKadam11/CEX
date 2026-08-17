import { describe, expect, it } from "vitest";
import { Side } from "@cex/exchange-types";
import { OrderBook } from "./orderBook.js";
import { makeOrder } from "../test/helpers.js";

describe("OrderBook", () => {
  it("adds bids and asks with correct BBO", () => {
    const book = new OrderBook("SOL-USD");

    book.add(makeOrder({ orderId: "b1", side: Side.BUY, price: 100, quantity: 1 }));
    book.add(makeOrder({ orderId: "b2", side: Side.BUY, price: 99, quantity: 2 }));
    book.add(makeOrder({ orderId: "s1", side: Side.SELL, price: 101, quantity: 3 }));

    expect(book.getBbo()).toEqual({ bestBid: 100, bestAsk: 101 });
  });

  it("aggregates quantity and count at the same price level", () => {
    const book = new OrderBook("SOL-USD");

    book.add(makeOrder({ orderId: "b1", side: Side.BUY, price: 100, quantity: 1 }));
    book.add(makeOrder({ orderId: "b2", side: Side.BUY, price: 100, quantity: 2 }));

    const snapshot = book.getSnapshot();
    expect(snapshot.bids[0]?.price).toBe(100);
    expect(snapshot.bids[0]?.quantity).toBe(3);
    expect(snapshot.bids[0]?.count).toBe(2);
  });

  it("sorts bids descending and asks ascending", () => {
    const book = new OrderBook("SOL-USD");

    book.add(makeOrder({ orderId: "b1", side: Side.BUY, price: 98, quantity: 1 }));
    book.add(makeOrder({ orderId: "b2", side: Side.BUY, price: 100, quantity: 1 }));
    book.add(makeOrder({ orderId: "s1", side: Side.SELL, price: 103, quantity: 1 }));
    book.add(makeOrder({ orderId: "s2", side: Side.SELL, price: 101, quantity: 1 }));

    const snapshot = book.getSnapshot();
    expect(snapshot.bids.map((b) => b.price)).toEqual([100, 98]);
    expect(snapshot.asks.map((a) => a.price)).toEqual([101, 103]);
  });

  it("removes an order and clears empty price levels", () => {
    const book = new OrderBook("SOL-USD");

    book.add(makeOrder({ orderId: "b1", side: Side.BUY, price: 100, quantity: 1 }));
    book.add(makeOrder({ orderId: "b2", side: Side.BUY, price: 100, quantity: 2 }));
    book.add(makeOrder({ orderId: "b3", side: Side.BUY, price: 99, quantity: 1.5 }));

    const removed = book.remove("b1");
    expect(removed?.orderId).toBe("b1");
    expect(book.getOrder("b1")).toBeUndefined();

    const snapshot = book.getSnapshot();
    expect(snapshot.bids[0]?.price).toBe(100);
    expect(snapshot.bids[0]?.quantity).toBe(2);
    expect(snapshot.bids[0]?.count).toBe(1);
    expect(snapshot.bbo.bestBid).toBe(100);
  });

  it("returns undefined when removing unknown order", () => {
    const book = new OrderBook("SOL-USD");
    expect(book.remove("missing")).toBeUndefined();
  });

  it("promotes next best bid when best level is removed", () => {
    const book = new OrderBook("SOL-USD");

    book.add(makeOrder({ orderId: "b1", side: Side.BUY, price: 100, quantity: 1 }));
    book.add(makeOrder({ orderId: "b2", side: Side.BUY, price: 99, quantity: 1 }));
    book.add(makeOrder({ orderId: "b3", side: Side.BUY, price: 98, quantity: 1 }));

    book.remove("b1");
    expect(book.getBestBid()?.price).toBe(99);

    book.remove("b2");
    expect(book.getBestBid()?.price).toBe(98);
  });

  it("applyFill reduces cached volume without removing partial maker", () => {
    const book = new OrderBook("SOL-USD");
    book.add(makeOrder({ orderId: "s1", side: Side.SELL, price: 100, quantity: 5 }));

    book.applyFill("s1", 2);

    expect(book.getOrder("s1")?.filledQuantity).toBe(2);
    expect(book.getSnapshot().asks[0]).toEqual({
      price: 100,
      quantity: 3,
      count: 1,
    });
  });

  it("FIFO dequeue preserves order across many fills at one price", () => {
    const book = new OrderBook("SOL-USD");
    book.add(makeOrder({ orderId: "s1", side: Side.SELL, price: 100, quantity: 1 }));
    book.add(makeOrder({ orderId: "s2", side: Side.SELL, price: 100, quantity: 1 }));
    book.add(makeOrder({ orderId: "s3", side: Side.SELL, price: 100, quantity: 1 }));

    book.applyFill("s1", 1);
    expect(book.getOrder("s1")).toBeUndefined();
    expect(book.getBestAsk()?.priceLevel.peekFirst()?.orderId).toBe("s2");

    book.applyFill("s2", 1);
    expect(book.getBestAsk()?.priceLevel.peekFirst()?.orderId).toBe("s3");
  });

  it("cancel middle order keeps neighbors and updates volume", () => {
    const book = new OrderBook("SOL-USD");
    book.add(makeOrder({ orderId: "s1", side: Side.SELL, price: 100, quantity: 1 }));
    book.add(makeOrder({ orderId: "s2", side: Side.SELL, price: 100, quantity: 2 }));
    book.add(makeOrder({ orderId: "s3", side: Side.SELL, price: 100, quantity: 3 }));

    book.remove("s2");

    expect(book.getOrder("s2")).toBeUndefined();
    expect(book.getSnapshot().asks[0]).toEqual({
      price: 100,
      quantity: 4,
      count: 2,
    });
    expect(book.getBestAsk()?.priceLevel.peekFirst()?.orderId).toBe("s1");
  });
});
