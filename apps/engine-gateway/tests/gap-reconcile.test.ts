import { afterEach, describe, expect, it, vi } from "vitest";
import {
  OrderType,
  Side,
  TimeInForce,
  type Order,
  type OrderEvent,
  type Position,
} from "@cex/exchange-types";
import { EngineClient } from "../src/engine/client.js";
import { reconcileSseGap } from "../src/sse/gapReconcile.js";
import { GatewayMetrics } from "../src/metrics.js";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("reconcileSseGap", () => {
  it("publishes retained order events, snapshots, and positions to Redis", async () => {
    const orderEvent: OrderEvent = {
      seq: 3,
      type: "FILL",
      orderId: "o1",
      userId: "u1",
      market: "SOL-USD",
      timestamp: 1,
      status: "FILLED",
      tradeId: "t1",
      price: 100,
      quantity: 1,
    };
    const order: Order = {
      orderId: "o1",
      userId: "u1",
      market: "SOL-USD",
      side: Side.BUY,
      type: OrderType.LIMIT,
      timeInForce: TimeInForce.GTC,
      price: 100,
      quantity: 1,
      filledQuantity: 1,
      status: "FILLED",
      timestamp: 1,
    };
    const position: Position = {
      userId: "u1",
      market: "SOL-USD-PERP",
      size: 0,
      entryPrice: 0,
      margin: 0,
      leverage: 1,
      updatedAt: 2,
    };

    const published: unknown[] = [];
    const redis = {
      xadd: vi.fn(async (...args: unknown[]) => {
        const payload = args[args.length - 1];
        if (typeof payload === "string") {
          published.push(JSON.parse(payload));
        }
        return "1-0";
      }),
    };

    const engine = {
      market: "SOL-USD",
      reconcile: vi.fn(async () => ({
        market: "SOL-USD",
        orders: [order],
        orderEvents: [orderEvent],
        positions: [position],
        liquidations: [],
        fundings: [],
        orderEventSeq: 3,
      })),
    } as unknown as EngineClient;

    const liveBook = { notify: vi.fn() };
    const positions = { publish: vi.fn() };
    const liquidations = { publish: vi.fn() };
    const fundings = { publish: vi.fn() };
    const metrics = new GatewayMetrics();

    const result = await reconcileSseGap(engine, {
      redis: redis as never,
      metrics,
      liveBook: liveBook as never,
      positions: positions as never,
      liquidations: liquidations as never,
      fundings: fundings as never,
    });

    expect(liveBook.notify).toHaveBeenCalledWith("SOL-USD");
    expect(result.orderEvents).toBe(1);
    expect(result.orderSnapshots).toBe(1);
    expect(result.positions).toBe(1);
    expect(positions.publish).toHaveBeenCalledWith(position);
    expect(published.some((e) => (e as { type: string }).type === "FILL")).toBe(
      true,
    );
    expect(
      published.some(
        (e) => (e as { eventId: string }).eventId === "reconcile-order-o1-FILLED-1",
      ),
    ).toBe(true);
    expect(
      published.some((e) => (e as { type: string }).type === "POSITION"),
    ).toBe(true);
  });
});
