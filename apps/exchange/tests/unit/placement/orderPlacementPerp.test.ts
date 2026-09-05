import { describe, expect, it } from "vitest";
import { Side, TimeInForce } from "@cex/exchange-types";
import { OrderBook } from "../../../src/book/orderBook.js";
import { fund, makeOrder } from "../../helpers.js";
import { OrderPlacementService } from "../../../src/placement/orderPlacementService.js";
import { initialMargin } from "../../../src/market/units.js";

describe("OrderPlacementService perps", () => {
  it("opens long/short on cross without delivering SOL", () => {
    const book = new OrderBook("SOL-USD-PERP");
    const service = new OrderPlacementService();
    fund(service, "long", { USD: 1_000 });
    fund(service, "short", { USD: 1_000 });

    service.place(
      makeOrder({
        orderId: "ask1",
        userId: "short",
        market: "SOL-USD-PERP",
        side: Side.SELL,
        price: 100,
        quantity: 2,
        leverage: 5,
      }),
      book,
    );

    const result = service.place(
      makeOrder({
        orderId: "bid1",
        userId: "long",
        market: "SOL-USD-PERP",
        side: Side.BUY,
        price: 100,
        quantity: 2,
        leverage: 5,
      }),
      book,
    );

    expect(result.accepted).toBe(true);
    expect(result.trades).toHaveLength(1);

    const longPos = service.positions.get("long", "SOL-USD-PERP");
    const shortPos = service.positions.get("short", "SOL-USD-PERP");
    expect(longPos?.size).toBe(2);
    expect(longPos?.entryPrice).toBe(100);
    expect(shortPos?.size).toBe(-2);
    expect(shortPos?.entryPrice).toBe(100);

    // No SOL inventory change
    expect(service.balances.get("long", "SOL").available).toBe(0);
    expect(service.balances.get("short", "SOL").available).toBe(0);

    const margin = initialMargin(200, 5); // 40
    expect(longPos?.margin).toBe(margin);
    expect(shortPos?.margin).toBe(margin);
    expect(service.balances.get("long", "USD")).toEqual({
      userId: "long",
      asset: "USD",
      available: 1_000 - margin,
      locked: margin,
    });
    expect(service.balances.get("short", "USD")).toEqual({
      userId: "short",
      asset: "USD",
      available: 1_000 - margin,
      locked: margin,
    });
  });

  it("realizes PnL when closing a long", () => {
    const book = new OrderBook("SOL-USD-PERP");
    const service = new OrderPlacementService();
    fund(service, "long", { USD: 5_000 });
    fund(service, "short", { USD: 5_000 });
    fund(service, "exit", { USD: 5_000 });

    service.place(
      makeOrder({
        orderId: "s1",
        userId: "short",
        market: "SOL-USD-PERP",
        side: Side.SELL,
        price: 100,
        quantity: 1,
        leverage: 1,
      }),
      book,
    );
    service.place(
      makeOrder({
        orderId: "b1",
        userId: "long",
        market: "SOL-USD-PERP",
        side: Side.BUY,
        price: 100,
        quantity: 1,
        leverage: 1,
      }),
      book,
    );

    // Counterparty buys to take the long's sell (close)
    service.place(
      makeOrder({
        orderId: "b2",
        userId: "exit",
        market: "SOL-USD-PERP",
        side: Side.BUY,
        price: 110,
        quantity: 1,
        leverage: 1,
      }),
      book,
    );
    const close = service.place(
      makeOrder({
        orderId: "s2",
        userId: "long",
        market: "SOL-USD-PERP",
        side: Side.SELL,
        price: 110,
        quantity: 1,
        leverage: 1,
        timeInForce: TimeInForce.IOC,
      }),
      book,
    );

    expect(close.accepted).toBe(true);
    expect(service.positions.get("long", "SOL-USD-PERP")).toBeUndefined();
    // Opened with 100 locked; closed at +10 PnL; all USD free again + profit
    expect(service.balances.get("long", "USD")).toEqual({
      userId: "long",
      asset: "USD",
      available: 5_010,
      locked: 0,
    });
  });

  it("rejects perp place without enough USD margin", () => {
    const book = new OrderBook("SOL-USD-PERP");
    const service = new OrderPlacementService();
    fund(service, "trader", { USD: 10 });

    const result = service.place(
      makeOrder({
        orderId: "b1",
        userId: "trader",
        market: "SOL-USD-PERP",
        side: Side.BUY,
        price: 100,
        quantity: 1,
        leverage: 1,
      }),
      book,
    );

    expect(result.accepted).toBe(false);
    expect(result.reason).toBe("INSUFFICIENT_BALANCE");
  });
});
