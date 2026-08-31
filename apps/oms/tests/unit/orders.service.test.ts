import type Redis from "ioredis";
import { OrderType, Side, TimeInForce } from "@cex/exchange-types";
import { describe, expect, it, vi } from "vitest";
import {
  OrderOwnershipError,
  OrderService,
  type PlaceOrderInput,
} from "../../src/orders/service.js";
import type { OrderRepository } from "../../src/orders/repository.js";

const placeInput: PlaceOrderInput = {
  userId: "user-1",
  clientOrderId: "client-1",
  market: "SOL-USD",
  side: Side.BUY,
  orderType: OrderType.LIMIT,
  timeInForce: TimeInForce.GTC,
  price: 100,
  quantity: 2,
};

describe("OrderService", () => {
  it("creates a pending order and publishes a place command", async () => {
    const storedOrder = { id: "db-order-1", status: "PENDING" };
    const repository = {
      findByClientOrderId: vi.fn().mockResolvedValue(null),
      createPending: vi.fn().mockResolvedValue(storedOrder),
    } as unknown as OrderRepository;
    const redis = {
      xadd: vi.fn().mockResolvedValue("1-0"),
    } as unknown as Redis;
    const service = new OrderService(repository, redis);

    const result = await service.place(placeInput);

    expect(result.order).toBe(storedOrder);
    expect(result.existing).toBe(false);
    expect(repository.createPending).toHaveBeenCalledOnce();
    expect(redis.xadd).toHaveBeenCalledOnce();
  });

  it("does not publish a second command for the same client order", async () => {
    const storedOrder = {
      id: "db-order-1",
      status: "PENDING",
      market: "SOL-USD",
      side: "BUY",
      type: "LIMIT",
      timeInForce: "GTC",
      price: 100,
      quantity: 2,
      quoteBudget: null,
      placeCommandId: "original-command",
      engineOrderId: "original-engine-order",
    };
    const repository = {
      findByClientOrderId: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(storedOrder),
      createPending: vi.fn().mockResolvedValue(storedOrder),
    } as unknown as OrderRepository;
    const redis = {
      xadd: vi.fn().mockResolvedValue("1-0"),
    } as unknown as Redis;
    const service = new OrderService(repository, redis);

    await service.place(placeInput);
    const second = await service.place(placeInput);

    expect(second.existing).toBe(true);
    expect(repository.createPending).toHaveBeenCalledOnce();
    expect(redis.xadd).toHaveBeenCalledOnce();
  });

  it("resolves concurrent client-order creates to the original order", async () => {
    const storedOrder = {
      id: "db-order-1",
      status: "PENDING",
      market: "SOL-USD",
      side: "BUY",
      type: "LIMIT",
      timeInForce: "GTC",
      price: 100,
      quantity: 2,
      quoteBudget: null,
      placeCommandId: "original-command",
      engineOrderId: "original-engine-order",
    };
    const repository = {
      findByClientOrderId: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValue(storedOrder),
      createPending: vi
        .fn()
        .mockRejectedValue({ code: "P2002" }),
    } as unknown as OrderRepository;
    const redis = {
      xadd: vi.fn(),
    } as unknown as Redis;
    const service = new OrderService(repository, redis);

    const [first, second] = await Promise.all([
      service.place(placeInput),
      service.place(placeInput),
    ]);

    expect(first.existing).toBe(true);
    expect(second.existing).toBe(true);
    expect(first.order).toBe(storedOrder);
    expect(first.command.commandId).toBe("original-command");
    expect(first.command.orderId).toBe("original-engine-order");
    expect(redis.xadd).not.toHaveBeenCalled();
  });

  it("preserves FOK_BUDGET when creating the command", async () => {
    const repository = {
      findByClientOrderId: vi.fn().mockResolvedValue(null),
      createPending: vi.fn().mockResolvedValue({
        id: "db-order-1",
        status: "PENDING",
      }),
    } as unknown as OrderRepository;
    const redis = {
      xadd: vi.fn().mockResolvedValue("1-0"),
    } as unknown as Redis;
    const service = new OrderService(repository, redis);

    await service.place({
      ...placeInput,
      clientOrderId: "budget-client",
      orderType: OrderType.MARKET,
      timeInForce: TimeInForce.FOK_BUDGET,
      price: 0,
      quoteBudget: 300,
    });

    expect(repository.createPending).toHaveBeenCalledWith(
      expect.objectContaining({
        orderType: OrderType.MARKET,
        timeInForce: TimeInForce.FOK_BUDGET,
        quoteBudget: 300,
      }),
      expect.any(String),
    );
  });

  it("rejects cancellation by another user", async () => {
    const repository = {
      findByEngineOrderId: vi.fn().mockResolvedValue({
        id: "db-order-1",
        userId: "owner",
        market: "SOL-USD",
      }),
    } as unknown as OrderRepository;
    const redis = {
      xadd: vi.fn(),
    } as unknown as Redis;
    const service = new OrderService(repository, redis);

    await expect(service.cancel("other-user", "engine-order-1")).rejects.toBeInstanceOf(
      OrderOwnershipError,
    );
    expect(redis.xadd).not.toHaveBeenCalled();
  });

});
