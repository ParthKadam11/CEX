import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlaceCommand } from "@cex/app-contracts";
import { OrderType, Side, TimeInForce } from "@cex/exchange-types";
import { CommandHandler } from "../src/commands/handler.js";
import { CommandDedupe } from "../src/dedupe.js";
import type { EngineRegistry } from "../src/engine/registry.js";
import { GatewayMetrics } from "../src/metrics.js";

afterEach(() => {
  vi.restoreAllMocks();
});

function placeCommand(overrides: Partial<PlaceCommand> = {}): PlaceCommand {
  return {
    commandId: "cmd-place-1",
    type: "PLACE",
    userId: "u1",
    clientOrderId: "c1",
    market: "SOL-USD",
    side: Side.BUY,
    orderType: OrderType.LIMIT,
    timeInForce: TimeInForce.GTC,
    price: 100,
    quantity: 1,
    orderId: "ord-1",
    timestamp: 1,
    ...overrides,
  };
}

describe("CommandHandler crash window", () => {
  it("saves outcome before publish and replays without calling engine again", async () => {
    const order = {
      orderId: "ord-1",
      userId: "u1",
      market: "SOL-USD" as const,
      side: Side.BUY,
      type: OrderType.LIMIT,
      timeInForce: TimeInForce.GTC,
      price: 100,
      quantity: 1,
      filledQuantity: 0,
      status: "OPEN" as const,
      timestamp: 1,
    };
    const place = vi.fn().mockResolvedValue({
      accepted: true,
      order,
      trades: [],
    });
    const engines = {
      get: () => ({ place }),
    } as unknown as EngineRegistry;

    const store = new Map<string, string>();
    const redis = {
      get: vi.fn(async (key: string) => store.get(key) ?? null),
      set: vi.fn(async (key: string, value: string) => {
        store.set(key, value);
        return "OK";
      }),
      expire: vi.fn(async () => 1),
      pipeline: vi.fn(() => {
        const ops: Array<() => void> = [];
        return {
          set: (key: string, value: string) => {
            ops.push(() => store.set(key, value));
            return undefined;
          },
          expire: () => undefined,
          exec: async () => {
            for (const op of ops) op();
            return [];
          },
        };
      }),
      xadd: vi.fn(async () => "1-0"),
    };

    const dedupe = new CommandDedupe(redis as never);
    const metrics = new GatewayMetrics();
    const handler = new CommandHandler(
      engines,
      "SOL-USD",
      redis as never,
      dedupe,
      metrics,
    );

    // Crash after saveOutcome, before publish completes: simulate by
    // running execute path then failing xadd on first attempt.
    let publishes = 0;
    redis.xadd.mockImplementation(async () => {
      publishes += 1;
      if (publishes === 1) throw new Error("redis down");
      return "1-0";
    });

    await handler.handle(placeCommand());
    expect(place).toHaveBeenCalledTimes(1);
    expect(await dedupe.isProcessed("cmd-place-1")).toBe(false);
    expect(await dedupe.loadOutcome("cmd-place-1")).not.toBeNull();

    // Retry: must not call engine again; must publish from outcome.
    redis.xadd.mockResolvedValue("1-0");
    await handler.handle(placeCommand());

    expect(place).toHaveBeenCalledTimes(1);
    expect(await dedupe.isProcessed("cmd-place-1")).toBe(true);
    expect(redis.xadd).toHaveBeenCalled();
    const payloads = redis.xadd.mock.calls.map(
      (call) => JSON.parse(String(call.at(-1))) as { eventId: string; type: string },
    );
    expect(payloads.some((p) => p.type === "ACCEPTED")).toBe(true);
    expect(payloads.every((p) => p.eventId.startsWith("gw-cmd-place-1-"))).toBe(
      true,
    );
  });

  it("skips fully processed commands", async () => {
    const place = vi.fn();
    const engines = {
      get: () => ({ place }),
    } as unknown as EngineRegistry;
    const store = new Map<string, string>([
      ["engine-gateway:dedupe:cmd-place-1", "1"],
    ]);
    const redis = {
      get: vi.fn(async (key: string) => store.get(key) ?? null),
      set: vi.fn(),
      expire: vi.fn(),
      pipeline: vi.fn(),
      xadd: vi.fn(),
    };
    const handler = new CommandHandler(
      engines,
      "SOL-USD",
      redis as never,
      new CommandDedupe(redis as never),
      new GatewayMetrics(),
    );

    await handler.handle(placeCommand());
    expect(place).not.toHaveBeenCalled();
    expect(redis.xadd).not.toHaveBeenCalled();
  });
});
