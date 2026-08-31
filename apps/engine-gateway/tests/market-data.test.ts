import { describe, expect, it, vi } from "vitest";
import { publishMarketDataEvent } from "../src/redis/pubsub.js";

describe("durable market-data publishing", () => {
  it("writes a bounded event envelope to md:events", async () => {
    const redis = {
      xadd: vi.fn().mockResolvedValue("1-0"),
    };
    const event = {
      eventId: "trade-SOL-USD-t-1",
      kind: "TRADE" as const,
      payload: {
        market: "SOL-USD" as const,
        tradeId: "t-1",
        engineSequence: 1,
        price: 100,
        quantity: 1,
        buyOrderId: "buy-1",
        sellOrderId: "sell-1",
        timestamp: 1_700_000_000_000,
      },
    };

    await publishMarketDataEvent(redis as never, event);

    expect(redis.xadd).toHaveBeenCalledWith(
      "md:events",
      "MAXLEN",
      "~",
      1_000_000,
      "*",
      "payload",
      JSON.stringify(event),
    );
  });
});
