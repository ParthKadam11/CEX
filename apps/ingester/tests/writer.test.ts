import { describe, expect, it, vi } from "vitest";
import { persistEvents } from "../src/db.js";
import type { MarketDataEvent } from "@cex/app-contracts";

const trade: MarketDataEvent = {
  eventId: "trade-SOL-USD-t-1",
  kind: "TRADE",
  payload: {
    market: "SOL-USD",
    tradeId: "t-1",
    engineSequence: 1,
    price: 100,
    quantity: 2,
    buyOrderId: "buy-1",
    sellOrderId: "sell-1",
    timestamp: 1_700_000_000_000,
  },
};

describe("market-data persistence", () => {
  it("persists a trade and commits the transaction", async () => {
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({}),
      release: vi.fn(),
    };
    const pool = {
      connect: vi.fn().mockResolvedValue(client),
    };

    await persistEvents(pool as never, [trade]);

    expect(client.query).toHaveBeenCalledWith("BEGIN");
    expect(client.query).toHaveBeenCalledWith("COMMIT");
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("skips duplicate trade keys while still committing the batch", async () => {
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rowCount: 0 })
        .mockResolvedValueOnce({}),
      release: vi.fn(),
    };
    const pool = {
      connect: vi.fn().mockResolvedValue(client),
    };

    await persistEvents(pool as never, [trade]);

    expect(client.query).not.toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO trade_ticks"),
      expect.anything(),
    );
    expect(client.query).toHaveBeenCalledWith("COMMIT");
  });
});
