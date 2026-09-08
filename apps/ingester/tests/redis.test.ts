import { describe, expect, it, vi } from "vitest";
import { isMarketDataEvent } from "@cex/app-contracts";
import { readMessages } from "../src/redis.js";

const event = {
  eventId: "trade-SOL-USD-t-9",
  kind: "TRADE" as const,
  payload: {
    market: "SOL-USD" as const,
    tradeId: "t-9",
    engineSequence: 9,
    price: 100,
    quantity: 1,
    buyOrderId: "buy-9",
    sellOrderId: "sell-9",
    timestamp: 1_700_000_000_000,
  },
};

describe("market-data stream recovery", () => {
  it("claims abandoned messages before reading new messages", async () => {
    const redis = {
      xpending: vi.fn().mockResolvedValue([["9-0", "old-writer", 30_000, 1]]),
      xclaim: vi
        .fn()
        .mockResolvedValue([["9-0", ["payload", JSON.stringify(event)]]]),
      xreadgroup: vi.fn().mockResolvedValue(null),
    };

    const messages = await readMessages(redis as never, "new-writer", 10, 100);

    expect(redis.xclaim).toHaveBeenCalled();
    expect(redis.xreadgroup).toHaveBeenCalled();
    expect(messages).toEqual([{ id: "9-0", event }]);
  });

  it("rejects malformed market-data payloads", () => {
    expect(isMarketDataEvent({ eventId: "bad", kind: "TRADE" })).toBe(false);
  });
});
