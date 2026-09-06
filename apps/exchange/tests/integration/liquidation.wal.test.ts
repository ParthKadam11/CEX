import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Side } from "@cex/exchange-types";
import { MarketRuntime } from "../../src/market/runtime.js";
import { makeOrder } from "../helpers.js";
import { LIQUIDATOR_USER_ID } from "../../src/risk/liquidation.js";

function tempWalPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cex-liq-wal-"));
  return path.join(dir, "SOL-USD-PERP.jsonl");
}

describe("perp liquidation via mark move", () => {
  it("force-closes underwater long when mark drops after a trade", async () => {
    const file = tempWalPath();
    const live = MarketRuntime.open("SOL-USD-PERP", file);

    await live.credit("long", "USD", 50);
    await live.credit("short", "USD", 5_000);
    await live.credit("mm", "USD", 5_000);
    await live.credit("taker", "USD", 5_000);

    await live.place(
      makeOrder({
        orderId: "s-open",
        userId: "short",
        market: "SOL-USD-PERP",
        side: Side.SELL,
        price: 100,
        quantity: 1,
        leverage: 5,
      }),
    );
    await live.place(
      makeOrder({
        orderId: "b-open",
        userId: "long",
        market: "SOL-USD-PERP",
        side: Side.BUY,
        price: 100,
        quantity: 1,
        leverage: 5,
      }),
    );
    expect(live.positions.get("long", "SOL-USD-PERP")?.size).toBe(1);

    await live.place(
      makeOrder({
        orderId: "mm-ask",
        userId: "mm",
        market: "SOL-USD-PERP",
        side: Side.SELL,
        price: 70,
        quantity: 1,
        leverage: 5,
      }),
    );
    await live.place(
      makeOrder({
        orderId: "tk-bid",
        userId: "taker",
        market: "SOL-USD-PERP",
        side: Side.BUY,
        price: 70,
        quantity: 1,
        leverage: 5,
      }),
    );

    expect(live.positions.get("long", "SOL-USD-PERP")).toBeUndefined();
    expect(
      live.positions.get(LIQUIDATOR_USER_ID, "SOL-USD-PERP"),
    ).toBeUndefined();

    const wal = fs.readFileSync(file, "utf8");
    expect(wal).toContain('"type":"LIQUIDATE"');
    expect(wal).toContain('"userId":"long"');

    await live.close();

    const restarted = MarketRuntime.open("SOL-USD-PERP", file);
    expect(restarted.positions.get("long", "SOL-USD-PERP")).toBeUndefined();
    await restarted.close();
  });

  it("force-closes underwater short when mark rises after a trade", async () => {
    const file = tempWalPath();
    const live = MarketRuntime.open("SOL-USD-PERP", file);

    await live.credit("long", "USD", 5_000);
    await live.credit("short", "USD", 50);
    await live.credit("mm", "USD", 5_000);
    await live.credit("taker", "USD", 5_000);

    await live.place(
      makeOrder({
        orderId: "s-open",
        userId: "short",
        market: "SOL-USD-PERP",
        side: Side.SELL,
        price: 100,
        quantity: 1,
        leverage: 5,
      }),
    );
    await live.place(
      makeOrder({
        orderId: "b-open",
        userId: "long",
        market: "SOL-USD-PERP",
        side: Side.BUY,
        price: 100,
        quantity: 1,
        leverage: 5,
      }),
    );
    expect(live.positions.get("short", "SOL-USD-PERP")?.size).toBe(-1);

    await live.place(
      makeOrder({
        orderId: "mm-bid",
        userId: "mm",
        market: "SOL-USD-PERP",
        side: Side.BUY,
        price: 130,
        quantity: 1,
        leverage: 5,
      }),
    );
    await live.place(
      makeOrder({
        orderId: "tk-ask",
        userId: "taker",
        market: "SOL-USD-PERP",
        side: Side.SELL,
        price: 130,
        quantity: 1,
        leverage: 5,
      }),
    );

    expect(live.positions.get("short", "SOL-USD-PERP")).toBeUndefined();

    const wal = fs.readFileSync(file, "utf8");
    expect(wal).toContain('"type":"LIQUIDATE"');
    expect(wal).toContain('"userId":"short"');

    await live.close();
  });
});
