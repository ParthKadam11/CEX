import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Side, TimeInForce } from "@cex/exchange-types";
import { MarketRuntime } from "../../src/market/runtime.js";
import { makeOrder } from "../helpers.js";

function tempWalPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cex-wal-int-"));
  return path.join(dir, "SOL-USD.jsonl");
}

describe("MarketRuntime WAL replay", () => {
  it("restores balances, book, and orders after a restart", () => {
    const file = tempWalPath();
    const live = MarketRuntime.open("SOL-USD", file);

    live.credit("seller", "SOL", 2);
    live.credit("buyer", "USD", 500);

    live.place(
      makeOrder({
        orderId: "s1",
        side: Side.SELL,
        price: 100,
        quantity: 2,
        userId: "seller",
      }),
    );
    live.place(
      makeOrder({
        orderId: "b1",
        side: Side.BUY,
        price: 100,
        quantity: 5,
        userId: "buyer",
        timeInForce: TimeInForce.GTC,
      }),
    );

    expect(live.book.getOrder("b1")).toBeDefined();
    expect(live.queries.getById("b1")?.status).toBe("PARTIALLY_FILLED");
    expect(live.balances.get("buyer", "USD")).toEqual({
      userId: "buyer",
      asset: "USD",
      available: 0,
      locked: 300,
    });

    const linesBefore = fs.readFileSync(file, "utf8").trim().split("\n").length;

    const restarted = MarketRuntime.open("SOL-USD", file);

    expect(restarted.book.getSnapshot()).toEqual(live.book.getSnapshot());
    expect(restarted.queries.getById("s1")?.status).toBe("FILLED");
    expect(restarted.queries.getById("b1")?.status).toBe("PARTIALLY_FILLED");
    expect(restarted.balances.get("buyer", "USD")).toEqual({
      userId: "buyer",
      asset: "USD",
      available: 0,
      locked: 300,
    });
    expect(restarted.balances.get("buyer", "SOL").available).toBe(2);
    expect(restarted.balances.get("seller", "USD").available).toBe(200);

    expect(fs.readFileSync(file, "utf8").trim().split("\n")).toHaveLength(
      linesBefore,
    );
  });

  it("restores a cancel so leftover funds are unlocked after restart", () => {
    const file = tempWalPath();
    const live = MarketRuntime.open("SOL-USD", file);
    live.credit("buyer", "USD", 100);
    live.place(
      makeOrder({
        orderId: "b1",
        side: Side.BUY,
        price: 100,
        quantity: 1,
        userId: "buyer",
      }),
    );
    expect(live.cancel("b1").cancelled).toBe(true);

    const restarted = MarketRuntime.open("SOL-USD", file);
    expect(restarted.book.getOrder("b1")).toBeUndefined();
    expect(restarted.queries.getById("b1")?.status).toBe("CANCELLED");
    expect(restarted.balances.get("buyer", "USD")).toEqual({
      userId: "buyer",
      asset: "USD",
      available: 100,
      locked: 0,
    });
  });
});
