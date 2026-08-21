import { describe, expect, it } from "vitest";
import { Side, TimeInForce } from "@cex/exchange-types";
import { OrderBook } from "../../../src/book/orderBook.js";
import { fund, makeOrder } from "../../helpers.js";
import { OrderEventLog } from "../../../src/order/orderEventLog.js";
import { OrderStore } from "../../../src/order/orderStore.js";
import { OrderQueryService } from "../../../src/order/orderQueryService.js";
import { OrderPlacementService } from "../../../src/placement/orderPlacementService.js";

describe("OrderStore", () => {
  it("upserts by id and indexes by user", () => {
    const store = new OrderStore();
    const a = makeOrder({ orderId: "a", side: Side.BUY, price: 100, quantity: 1, userId: "u1" });
    const b = makeOrder({ orderId: "b", side: Side.SELL, price: 101, quantity: 1, userId: "u1" });
    const c = makeOrder({ orderId: "c", side: Side.BUY, price: 99, quantity: 1, userId: "u2" });

    store.upsert(a);
    store.upsert(b);
    store.upsert(c);

    expect(store.get("a")).toBe(a);
    expect(store.getByUser("u1").map((o) => o.orderId)).toEqual(["a", "b"]);
    expect(store.getByUser("u2").map((o) => o.orderId)).toEqual(["c"]);
    expect(store.getByUser("nobody")).toEqual([]);
  });

  it("keeps the same object reference so mutations are visible", () => {
    const store = new OrderStore();
    const order = makeOrder({ orderId: "a", side: Side.BUY, price: 100, quantity: 2 });
    store.upsert(order);

    order.filledQuantity = 1;
    order.status = "PARTIALLY_FILLED";

    expect(store.get("a")?.filledQuantity).toBe(1);
    expect(store.get("a")?.status).toBe("PARTIALLY_FILLED");
  });
});

describe("OrderQueryService", () => {
  it("filters open / status / market and reads history", () => {
    const store = new OrderStore();
    const log = new OrderEventLog();
    const queries = new OrderQueryService(store, log);

    const open = makeOrder({
      orderId: "o1",
      side: Side.BUY,
      price: 100,
      quantity: 1,
      userId: "u1",
      status: "OPEN",
    });
    const partial = makeOrder({
      orderId: "o2",
      side: Side.BUY,
      price: 100,
      quantity: 2,
      userId: "u1",
      status: "PARTIALLY_FILLED",
      filledQuantity: 1,
    });
    const filled = makeOrder({
      orderId: "o3",
      side: Side.SELL,
      price: 101,
      quantity: 1,
      userId: "u1",
      status: "FILLED",
      filledQuantity: 1,
    });

    store.upsert(open);
    store.upsert(partial);
    store.upsert(filled);

    log.append({
      type: "RESTING",
      orderId: "o1",
      userId: "u1",
      market: "SOL-USD",
    });
    log.append({
      type: "FILL",
      orderId: "o3",
      userId: "u1",
      market: "SOL-USD",
      quantity: 1,
    });

    expect(queries.getById("o2")?.status).toBe("PARTIALLY_FILLED");
    expect(queries.getOpenByUser("u1").map((o) => o.orderId)).toEqual(["o1", "o2"]);
    expect(queries.getByUser("u1", { status: "FILLED" }).map((o) => o.orderId)).toEqual([
      "o3",
    ]);
    expect(queries.getHistory("o1").map((e) => e.type)).toEqual(["RESTING"]);
    expect(queries.getEventsByUser("u1").map((e) => e.orderId)).toEqual(["o1", "o3"]);
  });
});

describe("OrderPlacementService queries", () => {
  it("indexes resting GTC and filled maker after a cross", () => {
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
        timeInForce: TimeInForce.GTC,
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

    expect(service.queries.getById("s1")?.status).toBe("FILLED");
    expect(service.queries.getById("b1")?.status).toBe("PARTIALLY_FILLED");
    expect(service.queries.getOpenByUser("buyer").map((o) => o.orderId)).toEqual(["b1"]);
    expect(service.queries.getOpenByUser("seller")).toEqual([]);
    expect(service.queries.getHistory("b1").some((e) => e.type === "RESTING")).toBe(true);
  });

  it("keeps rejected and cancelled orders queryable", () => {
    const book = new OrderBook("SOL-USD");
    const service = new OrderPlacementService();
    fund(service, "u1", { USD: 100 });

    service.place(
      makeOrder({
        orderId: "rej",
        side: Side.BUY,
        price: 100,
        quantity: 1,
        userId: "u1",
        timeInForce: TimeInForce.FOK_BUDGET,
        quoteBudget: 100,
      }),
      book,
    );

    service.place(
      makeOrder({
        orderId: "ioc",
        side: Side.BUY,
        price: 100,
        quantity: 1,
        userId: "u1",
        timeInForce: TimeInForce.IOC,
      }),
      book,
    );

    expect(service.queries.getById("rej")?.status).toBe("REJECTED");
    expect(service.queries.getById("ioc")?.status).toBe("CANCELLED");
    expect(service.queries.getOpenByUser("u1")).toEqual([]);
    expect(
      service.queries.getByUser("u1", { status: ["REJECTED", "CANCELLED"] }),
    ).toHaveLength(2);
  });
});
