import { describe, expect, it } from "vitest";
import { Side } from "@cex/exchange-types";
import { OrderBook } from "../../../src/book/orderBook.js";
import { OrderPlacementService } from "../../../src/placement/orderPlacementService.js";
import { fund, makeOrder } from "../../helpers.js";
import { isLiquidatable } from "../../../src/risk/liquidation.js";

describe("force-close liquidation", () => {
  it("liquidates an underwater long at mark", () => {
    const book = new OrderBook("SOL-USD-PERP");
    const service = new OrderPlacementService();
    fund(service, "long", { USD: 50 });
    fund(service, "short", { USD: 5_000 });

    // Open long 1 @ 100 with leverage 5 → margin 20
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

    const before = service.positions.get("long", "SOL-USD-PERP")!;
    expect(before.size).toBe(1);
    expect(isLiquidatable(before, 70, 50)).toBe(true);

    const events: unknown[] = [];
    service.onLiquidation((e) => events.push(e));

    const liq = service.forceCloseAtMark("long", "SOL-USD-PERP", 70, book);
    expect(liq).not.toBeNull();
    expect(liq!.realizedPnl).toBe(-30);
    expect(liq!.size).toBe(1);
    expect(liq!.mark).toBe(70);
    expect(events).toHaveLength(1);

    expect(service.positions.get("long", "SOL-USD-PERP")).toBeUndefined();
    // Funded 50; locked 20 margin; after unlock + realize -30 → available 20
    expect(service.balances.get("long", "USD")).toEqual({
      userId: "long",
      asset: "USD",
      available: 20,
      locked: 0,
    });
    expect(liq!.counterpartyUserId).toBe("sim-liquidator");
  });

  it("liquidates an underwater short at mark", () => {
    const book = new OrderBook("SOL-USD-PERP");
    const service = new OrderPlacementService();
    fund(service, "long", { USD: 5_000 });
    fund(service, "short", { USD: 50 });

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

    const before = service.positions.get("short", "SOL-USD-PERP")!;
    expect(isLiquidatable(before, 130, 50)).toBe(true);

    const liq = service.forceCloseAtMark("short", "SOL-USD-PERP", 130, book);
    expect(liq).not.toBeNull();
    expect(liq!.realizedPnl).toBe(-30);
    expect(service.positions.get("short", "SOL-USD-PERP")).toBeUndefined();
  });

  it("skips healthy positions in scanAndLiquidate", () => {
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

    const events = service.scanAndLiquidate("SOL-USD-PERP", 100, book);
    expect(events).toHaveLength(0);
    expect(service.positions.get("long", "SOL-USD-PERP")?.size).toBe(1);
  });
});
