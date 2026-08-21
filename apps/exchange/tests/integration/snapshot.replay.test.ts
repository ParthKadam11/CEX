import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Side, TimeInForce } from "@cex/exchange-types";
import { MarketRuntime } from "../../src/market/runtime.js";
import { snapshotPathFor } from "../../src/journal/snapshot.js";
import { makeOrder } from "../helpers.js";

function tempWalPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cex-snap-int-"));
  return path.join(dir, "SOL-USD.jsonl");
}

function walLineCount(file: string): number {
  const raw = fs.readFileSync(file, "utf8").trim();
  if (!raw) return 0;
  return raw.split("\n").filter(Boolean).length;
}

async function seedBook(runtime: MarketRuntime): Promise<void> {
  await runtime.credit("seller", "SOL", 2);
  await runtime.credit("buyer", "USD", 500);
  await runtime.place(
    makeOrder({
      orderId: "s1",
      side: Side.SELL,
      price: 100,
      quantity: 2,
      userId: "seller",
    }),
  );
  await runtime.place(
    makeOrder({
      orderId: "b1",
      side: Side.BUY,
      price: 100,
      quantity: 5,
      userId: "buyer",
      timeInForce: TimeInForce.GTC,
    }),
  );
}

describe("MarketRuntime snapshot + tail replay", () => {
  it("checkpoint truncates WAL; restart restores book and balances", async () => {
    const file = tempWalPath();
    const live = MarketRuntime.open("SOL-USD", file, undefined, {
      snapshotEvery: 0,
    });
    await seedBook(live);
    expect(walLineCount(file)).toBe(4);

    await live.checkpoint();

    expect(walLineCount(file)).toBe(0);
    expect(fs.existsSync(snapshotPathFor(file))).toBe(true);
    expect(live.book.getOrder("b1")).toBeDefined();
    expect(live.queries.getById("b1")?.status).toBe("PARTIALLY_FILLED");

    await live.close();
    const restarted = MarketRuntime.open("SOL-USD", file);
    expect(restarted.book.getSnapshot()).toEqual(live.book.getSnapshot());
    expect(restarted.queries.getById("b1")?.status).toBe("PARTIALLY_FILLED");
    expect(restarted.balances.get("buyer", "USD")).toEqual({
      userId: "buyer",
      asset: "USD",
      available: 0,
      locked: 300,
    });
    expect(restarted.balances.get("seller", "USD").available).toBe(200);
    await restarted.close();
  });

  it("drops old terminal orders at checkpoint when the cap is 0", async () => {
    const file = tempWalPath();
    const live = MarketRuntime.open("SOL-USD", file, undefined, {
      snapshotEvery: 0,
      maxTerminalOrders: 0,
    });
    await seedBook(live);
    await live.checkpoint();

    expect(live.queries.getById("s1")).toBeUndefined();
    expect(live.queries.getById("b1")?.status).toBe("PARTIALLY_FILLED");

    await live.close();
    const restarted = MarketRuntime.open("SOL-USD", file, undefined, {
      maxTerminalOrders: 0,
    });
    expect(restarted.queries.getById("s1")).toBeUndefined();
    expect(restarted.queries.getById("b1")?.status).toBe("PARTIALLY_FILLED");
    expect(restarted.book.getOrder("b1")).toBeDefined();
    await restarted.close();
  });

  it("replays WAL tail after a snapshot", async () => {
    const file = tempWalPath();
    const live = MarketRuntime.open("SOL-USD", file, undefined, {
      snapshotEvery: 0,
    });
    await seedBook(live);
    await live.checkpoint();
    expect((await live.cancel("b1")).cancelled).toBe(true);
    expect(walLineCount(file)).toBe(1);

    await live.close();
    const restarted = MarketRuntime.open("SOL-USD", file);
    expect(restarted.book.getOrder("b1")).toBeUndefined();
    expect(restarted.queries.getById("b1")?.status).toBe("CANCELLED");
    expect(restarted.balances.get("buyer", "USD")).toEqual({
      userId: "buyer",
      asset: "USD",
      available: 300,
      locked: 0,
    });
    await restarted.close();
  });

  it("auto-checkpoints every N commands", async () => {
    const file = tempWalPath();
    const live = MarketRuntime.open("SOL-USD", file, undefined, {
      snapshotEvery: 4,
    });
    await seedBook(live);
    expect(walLineCount(file)).toBe(0);
    expect(fs.existsSync(snapshotPathFor(file))).toBe(true);
    await live.close();
  });
});
