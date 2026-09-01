import { describe, expect, it, vi } from "vitest";
import { OmsOrderStatus } from "@cex/db/enums";
import { OrderRepository } from "../../src/orders/repository.js";

describe("OrderRepository.applyEvent", () => {
  it("stores fills for both maker and taker orders with the same tradeId", async () => {
    const buyOrder = {
      id: "buy-db",
      engineOrderId: "buy-engine",
      status: OmsOrderStatus.OPEN,
      filledQuantity: 0,
      lastEngineSequence: 0,
    };
    const sellOrder = {
      id: "sell-db",
      engineOrderId: "sell-engine",
      status: OmsOrderStatus.OPEN,
      filledQuantity: 0,
      lastEngineSequence: 0,
    };
    const fills: Array<{ orderId: string; tradeId: string }> = [];

    const tx = {
      omsProcessedEvent: {
        create: vi.fn().mockResolvedValue({}),
      },
      order: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce(buyOrder)
          .mockResolvedValueOnce(sellOrder),
        update: vi.fn().mockImplementation(({ where, data }) => ({
          ...buyOrder,
          ...sellOrder,
          id: where.id,
          ...data,
        })),
      },
      orderFill: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockImplementation(({ data }) => {
          fills.push(data);
          return data;
        }),
      },
    };
    const db = {
      $transaction: vi.fn(async (fn) => fn(tx)),
    };
    const repository = new OrderRepository(db as never);
    const fill = {
      tradeId: "t-1",
      price: 100,
      quantity: 1,
    };

    await repository.applyEvent({
      eventId: "fill-buy",
      type: "FILL",
      userId: "buyer",
      market: "SOL-USD",
      orderId: "buy-engine",
      status: "FILLED",
      engineSequence: 10,
      fills: [fill],
      timestamp: Date.now(),
    });
    await repository.applyEvent({
      eventId: "fill-sell",
      type: "FILL",
      userId: "seller",
      market: "SOL-USD",
      orderId: "sell-engine",
      status: "FILLED",
      engineSequence: 11,
      fills: [fill],
      timestamp: Date.now(),
    });

    expect(fills).toEqual([
      { orderId: "buy-db", tradeId: "t-1", price: 100, quantity: 1 },
      { orderId: "sell-db", tradeId: "t-1", price: 100, quantity: 1 },
    ]);
  });

  it("ignores stale engine status updates after a newer sequence", async () => {
    const order = {
      id: "order-db",
      engineOrderId: "engine-1",
      status: OmsOrderStatus.FILLED,
      filledQuantity: 1,
      lastEngineSequence: 20,
    };
    const update = vi.fn().mockResolvedValue(order);
    const tx = {
      omsProcessedEvent: { create: vi.fn().mockResolvedValue({}) },
      order: {
        findUnique: vi.fn().mockResolvedValue(order),
        update,
      },
      orderFill: {
        findUnique: vi.fn(),
        create: vi.fn(),
      },
    };
    const db = {
      $transaction: vi.fn(async (fn) => fn(tx)),
    };
    const repository = new OrderRepository(db as never);

    await repository.applyEvent({
      eventId: "stale-resting",
      type: "RESTING",
      userId: "user-1",
      market: "SOL-USD",
      orderId: "engine-1",
      status: "OPEN",
      engineSequence: 15,
      timestamp: Date.now(),
    });

    expect(update).toHaveBeenCalledWith({
      where: { id: "order-db" },
      data: expect.objectContaining({
        status: undefined,
        lastEngineSequence: 20,
      }),
    });
  });
});
