import { describe, expect, it } from "vitest";
import { Side } from "@cex/exchange-types";
import { OrderBook } from "../../../src/book/orderBook.js";
import { OrderPlacementService } from "../../../src/placement/orderPlacementService.js";
import { fund, makeOrder } from "../../helpers.js";

describe("funding settlement", () => {
  it("debits longs and credits shorts at the funding rate", () => {
    const book = new OrderBook("SOL-USD-PERP");
    const service = new OrderPlacementService();
    fund(service, "long", { USD: 5_000 });
    fund(service, "short", { USD: 5_000 });

    service.place(
      makeOrder({
        orderId: "s1",
        userId: "short",
        market: "SOL-USD-PERP",
        side: Side.SELL,
        price: 100,
        quantity: 1,
        leverage: 5,
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
        leverage: 5,
      }),
      book,
    );

    const longBefore = service.balances.get("long", "USD").available;
    const shortBefore = service.balances.get("short", "USD").available;

    const events: Array<{ userId: string; payment: number }> = [];
    service.onFunding((e) => events.push(e));

    const settled = service.settleFunding({
      market: "SOL-USD-PERP",
      mark: 100,
      fundingRateBps: 100,
    });

    // charge = trunc(1 * 100 * 100 / 10000) = 1
    expect(settled).toHaveLength(2);
    expect(events).toHaveLength(2);
    expect(service.balances.get("long", "USD").available).toBe(longBefore - 1);
    expect(service.balances.get("short", "USD").available).toBe(
      shortBefore + 1,
    );
  });

  it("skips settle when rate zero", () => {
    const book = new OrderBook("SOL-USD-PERP");
    const service = new OrderPlacementService();
    fund(service, "long", { USD: 1_000 });
    fund(service, "short", { USD: 1_000 });
    service.place(
      makeOrder({
        orderId: "s1",
        userId: "short",
        market: "SOL-USD-PERP",
        side: Side.SELL,
        price: 100,
        quantity: 1,
        leverage: 5,
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
        leverage: 5,
      }),
      book,
    );

    expect(
      service.settleFunding({
        market: "SOL-USD-PERP",
        mark: 100,
        fundingRateBps: 0,
      }),
    ).toHaveLength(0);
  });
});
