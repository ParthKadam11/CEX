import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Side } from "@cex/exchange-types";
import { EventBus } from "../../../src/api/eventBus.js";
import { createExchangeApp } from "../../../src/api/server.js";
import { MarketRuntime } from "../../../src/market/runtime.js";

function tempWal(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cex-api-"));
  return path.join(dir, "SOL-USD.jsonl");
}

describe("exchange HTTP + SSE", () => {
  it("credits, places, and returns book over REST", async () => {
    const bus = new EventBus();
    const runtime = MarketRuntime.open("SOL-USD", tempWal(), bus);
    const app = createExchangeApp(runtime, bus);

    const credit = await app.request("/v1/markets/SOL-USD/credit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: "u1", asset: "USD", amount: 500 }),
    });
    expect(credit.status).toBe(200);

    const sellCredit = await app.request("/v1/markets/SOL-USD/credit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: "u2", asset: "SOL", amount: 2 }),
    });
    expect(sellCredit.status).toBe(200);

    const sell = await app.request("/v1/markets/SOL-USD/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        orderId: "s1",
        userId: "u2",
        side: Side.SELL,
        price: 100,
        quantity: 2,
        timeInForce: "GTC",
      }),
    });
    expect(sell.status).toBe(200);

    const book = await app.request("/v1/markets/SOL-USD/book");
    const snapshot = await book.json();
    expect(snapshot.asks[0]).toMatchObject({ price: 100, quantity: 2 });
  });

  it("SSE receives ORDER events after a place", async () => {
    const bus = new EventBus();
    const runtime = MarketRuntime.open("SOL-USD", tempWal(), bus);
    const app = createExchangeApp(runtime, bus);

    await app.request("/v1/markets/SOL-USD/credit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: "u1", asset: "USD", amount: 100 }),
    });

    const seen: string[] = [];
    const unsubscribe = bus.subscribe((event) => {
      if (event.kind === "ORDER") seen.push(event.event.type);
      if (event.kind === "BBO") seen.push("BBO");
    });

    await app.request("/v1/markets/SOL-USD/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        orderId: "b1",
        userId: "u1",
        side: Side.BUY,
        price: 100,
        quantity: 1,
        timeInForce: "GTC",
      }),
    });

    unsubscribe();
    expect(seen).toContain("RESTING");
    expect(seen).toContain("BBO");
  });
});
