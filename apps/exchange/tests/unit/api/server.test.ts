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

  it("rejects fractional credit amounts", async () => {
    const bus = new EventBus();
    const runtime = MarketRuntime.open("SOL-USD", tempWal(), bus);
    const app = createExchangeApp(runtime, bus);

    const credit = await app.request("/v1/markets/SOL-USD/credit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: "u1", asset: "USD", amount: 0.1 }),
    });
    expect(credit.status).toBe(400);
    expect((await credit.json()).error.code).toBe("INVALID_UNITS");
    expect(credit.headers.get("x-request-id")).toBeTruthy();
  });

  it("group-commits concurrent credits", async () => {
    const bus = new EventBus();
    const wal = tempWal();
    const runtime = MarketRuntime.open("SOL-USD", wal, bus);
    const app = createExchangeApp(runtime, bus);

    const responses = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        app.request("/v1/markets/SOL-USD/credit", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            userId: `u${i}`,
            asset: "USD",
            amount: 1,
          }),
        }),
      ),
    );
    expect(responses.every((res) => res.status === 200)).toBe(true);

    await runtime.close();
    const restarted = MarketRuntime.open("SOL-USD", wal);
    expect(restarted.balances.get("u0", "USD").available).toBe(1);
    expect(restarted.balances.get("u19", "USD").available).toBe(1);
    await restarted.close();
  });

  it("protects engine APIs with the gateway token", async () => {
    const bus = new EventBus();
    const runtime = MarketRuntime.open("SOL-USD", tempWal(), bus);
    const app = createExchangeApp(runtime, bus, {
      gatewayToken: "secret",
    });
    const request = {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: "u1", asset: "USD", amount: 1 }),
    };

    const unauthorized = await app.request(
      "/v1/markets/SOL-USD/credit",
      request,
    );
    const authorized = await app.request(
      "/v1/markets/SOL-USD/credit",
      {
        ...request,
        headers: {
          ...request.headers,
          "x-gateway-token": "secret",
        },
      },
    );

    expect(unauthorized.status).toBe(401);
    expect(authorized.status).toBe(200);
    await runtime.close();
  });

  it("rejects unknown order types and invalid FOK_BUDGET combinations", async () => {
    const bus = new EventBus();
    const runtime = MarketRuntime.open("SOL-USD", tempWal(), bus);
    const app = createExchangeApp(runtime, bus);
    const request = (body: Record<string, unknown>) =>
      app.request("/v1/markets/SOL-USD/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          userId: "u1",
          side: "BUY",
          type: "LIMIT",
          price: 100,
          quantity: 1,
          ...body,
        }),
      });

    const unknownType = await request({ type: "NOT_AN_ORDER_TYPE" });
    expect(unknownType.status).toBe(400);
    expect((await unknownType.json()).error.code).toBe("INVALID_ORDER_TYPE");

    const invalidBudget = await request({
      timeInForce: "FOK_BUDGET",
      type: "LIMIT",
      quoteBudget: 100,
    });
    expect(invalidBudget.status).toBe(400);
    expect((await invalidBudget.json()).error.code).toBe(
      "FOK_BUDGET_REQUIRES_MARKET_BUY",
    );
    await runtime.close();
  });

  it("rejects duplicate engine order IDs and preserves the first order", async () => {
    const bus = new EventBus();
    const runtime = MarketRuntime.open("SOL-USD", tempWal(), bus);
    const app = createExchangeApp(runtime, bus);
    const headers = { "content-type": "application/json" };
    const place = (body: Record<string, unknown>) =>
      app.request("/v1/markets/SOL-USD/orders", {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });

    await app.request("/v1/markets/SOL-USD/credit", {
      method: "POST",
      headers,
      body: JSON.stringify({ userId: "u1", asset: "USD", amount: 100 }),
    });
    const first = await place({
      orderId: "same-id",
      userId: "u1",
      side: "BUY",
      type: "LIMIT",
      price: 100,
      quantity: 1,
    });
    const second = await place({
      orderId: "same-id",
      userId: "u2",
      side: "SELL",
      type: "LIMIT",
      price: 90,
      quantity: 1,
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(400);
    const duplicate = await second.json();
    expect(duplicate.error.code).toBe("DUPLICATE_ORDER_ID");
    expect(duplicate.order.userId).toBe("u1");
    expect(runtime.book.getOrder("same-id")?.userId).toBe("u1");
    await runtime.close();
  });

  it("hosts spot and perps in one app with separate books", async () => {
    const bus = new EventBus();
    const spot = MarketRuntime.open("SOL-USD", tempWal(), bus);
    const perpWal = path.join(path.dirname(tempWal()), "SOL-USD-PERP.jsonl");
    const perp = MarketRuntime.open("SOL-USD-PERP", perpWal, bus);
    const app = createExchangeApp(
      new Map([
        ["SOL-USD", spot],
        ["SOL-USD-PERP", perp],
      ]),
      bus,
    );

    const health = await (await app.request("/health")).json();
    expect(health).toEqual({
      ok: true,
      markets: ["SOL-USD", "SOL-USD-PERP"],
      market: "SOL-USD",
    });

    const headers = { "content-type": "application/json" };
    await app.request("/v1/markets/SOL-USD/credit", {
      method: "POST",
      headers,
      body: JSON.stringify({ userId: "u1", asset: "SOL", amount: 2 }),
    });
    await app.request("/v1/markets/SOL-USD-PERP/credit", {
      method: "POST",
      headers,
      body: JSON.stringify({ userId: "u1", asset: "USD", amount: 10_000 }),
    });

    await app.request("/v1/markets/SOL-USD/orders", {
      method: "POST",
      headers,
      body: JSON.stringify({
        orderId: "spot-ask",
        userId: "u1",
        side: "SELL",
        type: "LIMIT",
        price: 100,
        quantity: 1,
      }),
    });
    await app.request("/v1/markets/SOL-USD-PERP/orders", {
      method: "POST",
      headers,
      body: JSON.stringify({
        orderId: "perp-bid",
        userId: "u1",
        side: "BUY",
        type: "LIMIT",
        price: 99,
        quantity: 1,
        leverage: 5,
      }),
    });

    const spotBook = await (await app.request("/v1/markets/SOL-USD/book")).json();
    const perpBook = await (
      await app.request("/v1/markets/SOL-USD-PERP/book")
    ).json();
    expect(spotBook.asks).toEqual([{ price: 100, quantity: 1, count: 1 }]);
    expect(perpBook.bids).toEqual([{ price: 99, quantity: 1, count: 1 }]);
    expect(spotBook.bids).toEqual([]);
    expect(perpBook.asks).toEqual([]);

    await spot.close();
    await perp.close();
  });
});
