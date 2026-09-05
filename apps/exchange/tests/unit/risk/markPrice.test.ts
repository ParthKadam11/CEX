import { describe, expect, it } from "vitest";
import { Side } from "@cex/exchange-types";
import { OrderBook } from "../../../src/book/orderBook.js";
import { resolveMarkPrice } from "../../../src/risk/markPrice.js";
import { makeOrder } from "../../helpers.js";

describe("resolveMarkPrice", () => {
  it("uses BBO mid when two-sided", () => {
    const book = new OrderBook("SOL-USD-PERP");
    book.add(
      makeOrder({
        orderId: "b1",
        market: "SOL-USD-PERP",
        side: Side.BUY,
        price: 98,
        quantity: 1,
      }),
    );
    book.add(
      makeOrder({
        orderId: "a1",
        market: "SOL-USD-PERP",
        side: Side.SELL,
        price: 102,
        quantity: 1,
      }),
    );
    const mark = resolveMarkPrice(book, 100);
    expect(mark.mark).toBe(100);
    expect(mark.source).toBe("mid");
  });

  it("falls back to last trade", () => {
    const book = new OrderBook("SOL-USD-PERP");
    const mark = resolveMarkPrice(book, 111);
    expect(mark.mark).toBe(111);
    expect(mark.source).toBe("last");
  });
});
