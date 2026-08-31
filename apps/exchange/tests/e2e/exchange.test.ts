import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Side } from "@cex/exchange-types";
import { EventBus } from "../../src/api/eventBus.js";
import { createExchangeApp } from "../../src/api/server.js";
import { MarketRuntime } from "../../src/market/runtime.js";

/**
 * Full exchange-layer E2E (HTTP → runtime → placement → match → settle → WAL).
 * Run with: pnpm test:e2e   (verbose reporter lists every feature)
 */

type App = ReturnType<typeof createExchangeApp>;

function tempWal(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cex-e2e-"));
  return path.join(dir, "SOL-USD.jsonl");
}

async function body(res: Response) {
  return res.json() as Promise<Record<string, unknown>>;
}

function createExchange() {
  const walPath = tempWal();
  const bus = new EventBus();
  const runtime = MarketRuntime.open("SOL-USD", walPath, bus);
  const app = createExchangeApp(runtime, bus);
  return { walPath, bus, runtime, app };
}

async function credit(
  app: App,
  userId: string,
  asset: "SOL" | "USD",
  amount: number,
) {
  return app.request("/v1/markets/SOL-USD/credit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId, asset, amount }),
  });
}

async function place(app: App, order: Record<string, unknown>) {
  return app.request("/v1/markets/SOL-USD/orders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(order),
  });
}

async function cancel(app: App, orderId: string) {
  return app.request(`/v1/markets/SOL-USD/orders/${orderId}`, {
    method: "DELETE",
  });
}

describe("Exchange E2E — feature checklist", () => {
  describe("1. Health", () => {
    it("GET /health reports the live market", async () => {
      const { app } = createExchange();
      const res = await app.request("/health");
      expect(res.status).toBe(200);
      expect(await body(res)).toEqual({ ok: true, market: "SOL-USD" });
    });
  });

  describe("2. Credits & balances", () => {
    it("POST /credit deposits into available and GET /balances reads it", async () => {
      const { app } = createExchange();

      const creditRes = await credit(app, "alice", "USD", 500);
      expect(creditRes.status).toBe(200);
      const credited = await body(creditRes);
      expect(credited.balance).toMatchObject({
        userId: "alice",
        asset: "USD",
        available: 500,
        locked: 0,
      });

      const bal = await body(
        await app.request("/v1/markets/SOL-USD/balances/alice"),
      );
      expect(bal.balances).toEqual([
        { userId: "alice", asset: "USD", available: 500, locked: 0 },
      ]);
    });
  });

  describe("3. LIMIT GTC — rest on book", () => {
    it("places a resting sell, updates book BBO, and locks base SOL", async () => {
      const { app, runtime } = createExchange();
      await credit(app, "seller", "SOL", 3);

      const res = await place(app, {
        orderId: "s-rest",
        userId: "seller",
        side: Side.SELL,
        type: "LIMIT",
        price: 100,
        quantity: 3,
        timeInForce: "GTC",
      });
      expect(res.status).toBe(200);
      const placed = await body(res);
      expect(placed.accepted).toBe(true);
      expect(placed.order).toMatchObject({
        status: "OPEN",
        filledQuantity: 0,
      });

      const book = await body(await app.request("/v1/markets/SOL-USD/book"));
      expect(book.asks).toEqual([{ price: 100, quantity: 3, count: 1 }]);
      expect(book.bbo).toEqual({ bestBid: null, bestAsk: 100 });

      expect(runtime.balances.get("seller", "SOL")).toEqual({
        userId: "seller",
        asset: "SOL",
        available: 0,
        locked: 3,
      });
    });
  });

  describe("4. LIMIT GTC — match + settle", () => {
    it("crosses buy vs resting sell, fills, moves balances, leaves leftover ask", async () => {
      const { app, runtime } = createExchange();
      await credit(app, "seller", "SOL", 5);
      await credit(app, "buyer", "USD", 1000);

      await place(app, {
        orderId: "s1",
        userId: "seller",
        side: Side.SELL,
        type: "LIMIT",
        price: 100,
        quantity: 3,
        timeInForce: "GTC",
      });

      const buy = await place(app, {
        orderId: "b1",
        userId: "buyer",
        side: Side.BUY,
        type: "LIMIT",
        price: 100,
        quantity: 2,
        timeInForce: "GTC",
      });
      const buyBody = await body(buy);
      expect(buyBody.accepted).toBe(true);
      expect(buyBody.order).toMatchObject({
        status: "FILLED",
        filledQuantity: 2,
      });
      expect(buyBody.trades).toHaveLength(1);

      expect(runtime.queries.getById("s1")).toMatchObject({
        status: "PARTIALLY_FILLED",
        filledQuantity: 2,
      });
      expect(runtime.book.getSnapshot().asks).toEqual([
        { price: 100, quantity: 1, count: 1 },
      ]);

      expect(runtime.balances.get("buyer", "USD")).toMatchObject({
        available: 800,
        locked: 0,
      });
      expect(runtime.balances.get("buyer", "SOL").available).toBe(2);
      expect(runtime.balances.get("seller", "USD").available).toBe(200);
      expect(runtime.balances.get("seller", "SOL")).toMatchObject({
        available: 2,
        locked: 1,
      });
    });
  });

  describe("5. Cancel — unlock leftover", () => {
    it("DELETE /orders/:id removes resting order and returns locked funds", async () => {
      const { app, runtime } = createExchange();
      await credit(app, "buyer", "USD", 100);

      await place(app, {
        orderId: "b-cancel",
        userId: "buyer",
        side: Side.BUY,
        type: "LIMIT",
        price: 100,
        quantity: 1,
        timeInForce: "GTC",
      });
      expect(runtime.balances.get("buyer", "USD").locked).toBe(100);

      const res = await cancel(app, "b-cancel");
      expect(res.status).toBe(200);
      expect(await body(res)).toMatchObject({ cancelled: true });

      expect(runtime.book.getOrder("b-cancel")).toBeUndefined();
      expect(runtime.queries.getById("b-cancel")?.status).toBe("CANCELLED");
      expect(runtime.balances.get("buyer", "USD")).toEqual({
        userId: "buyer",
        asset: "USD",
        available: 100,
        locked: 0,
      });
    });
  });

  describe("6. IOC — never rests", () => {
    it("partial IOC fill cancels leftover and unlocks unused quote", async () => {
      const { app, runtime } = createExchange();
      await credit(app, "seller", "SOL", 1);
      await credit(app, "buyer", "USD", 500);

      await place(app, {
        orderId: "s-ioc",
        userId: "seller",
        side: Side.SELL,
        type: "LIMIT",
        price: 100,
        quantity: 1,
        timeInForce: "GTC",
      });

      const res = await place(app, {
        orderId: "b-ioc",
        userId: "buyer",
        side: Side.BUY,
        type: "LIMIT",
        price: 100,
        quantity: 3,
        timeInForce: "IOC",
      });
      const placed = await body(res);
      expect(placed.accepted).toBe(true);
      expect(placed.order).toMatchObject({
        status: "CANCELLED",
        filledQuantity: 1,
      });
      expect(runtime.book.getOrder("b-ioc")).toBeUndefined();
      expect(runtime.balances.get("buyer", "USD")).toMatchObject({
        available: 400,
        locked: 0,
      });
      expect(runtime.balances.get("buyer", "SOL").available).toBe(1);
    });
  });

  describe("7. FOK — all or nothing", () => {
    it("FOK fully fills when liquidity is enough", async () => {
      const { app, runtime } = createExchange();
      await credit(app, "seller", "SOL", 2);
      await credit(app, "buyer", "USD", 300);

      await place(app, {
        orderId: "s-fok",
        userId: "seller",
        side: Side.SELL,
        type: "LIMIT",
        price: 100,
        quantity: 2,
        timeInForce: "GTC",
      });

      const res = await place(app, {
        orderId: "b-fok-ok",
        userId: "buyer",
        side: Side.BUY,
        type: "LIMIT",
        price: 100,
        quantity: 2,
        timeInForce: "FOK",
      });
      const placed = await body(res);
      expect(placed.accepted).toBe(true);
      expect(placed.order).toMatchObject({ status: "FILLED", filledQuantity: 2 });
      expect(runtime.book.getSnapshot().asks).toEqual([]);
    });

    it("FOK rejects without mutating the book when liquidity is short", async () => {
      const { app, runtime } = createExchange();
      await credit(app, "seller", "SOL", 1);
      await credit(app, "buyer", "USD", 500);

      await place(app, {
        orderId: "s-fok-thin",
        userId: "seller",
        side: Side.SELL,
        type: "LIMIT",
        price: 100,
        quantity: 1,
        timeInForce: "GTC",
      });
      const before = runtime.book.getSnapshot();

      const res = await place(app, {
        orderId: "b-fok-fail",
        userId: "buyer",
        side: Side.BUY,
        type: "LIMIT",
        price: 100,
        quantity: 5,
        timeInForce: "FOK",
      });
      const placed = await body(res);
      expect(placed.accepted).toBe(false);
      expect(placed.order).toMatchObject({ status: "REJECTED" });
      expect(runtime.book.getSnapshot()).toEqual(before);
      expect(runtime.balances.get("buyer", "USD")).toMatchObject({
        available: 500,
        locked: 0,
      });
    });
  });

  describe("8. MARKET orders", () => {
    it("MARKET sell walks bids with no limit and cancels unfilled size", async () => {
      const { app, runtime } = createExchange();
      await credit(app, "buyer", "USD", 300);
      await credit(app, "seller", "SOL", 5);

      await place(app, {
        orderId: "b-bid1",
        userId: "buyer",
        side: Side.BUY,
        type: "LIMIT",
        price: 100,
        quantity: 1,
        timeInForce: "GTC",
      });
      await place(app, {
        orderId: "b-bid2",
        userId: "buyer",
        side: Side.BUY,
        type: "LIMIT",
        price: 90,
        quantity: 2,
        timeInForce: "GTC",
      });

      const res = await place(app, {
        orderId: "s-mkt",
        userId: "seller",
        side: Side.SELL,
        type: "MARKET",
        price: 0,
        quantity: 5,
        timeInForce: "IOC",
      });
      const placed = await body(res);
      expect(placed.accepted).toBe(true);
      expect(placed.order).toMatchObject({
        status: "CANCELLED",
        filledQuantity: 3,
      });
      expect(runtime.balances.get("seller", "SOL")).toMatchObject({
        available: 2,
        locked: 0,
      });
      expect(runtime.balances.get("seller", "USD").available).toBe(280);
    });

    it("MARKET buy spends quoteBudget across asks and never rests", async () => {
      const { app, runtime } = createExchange();
      await credit(app, "s1", "SOL", 2);
      await credit(app, "s2", "SOL", 2);
      await credit(app, "buyer", "USD", 500);

      await place(app, {
        orderId: "ask1",
        userId: "s1",
        side: Side.SELL,
        type: "LIMIT",
        price: 100,
        quantity: 2,
        timeInForce: "GTC",
      });
      await place(app, {
        orderId: "ask2",
        userId: "s2",
        side: Side.SELL,
        type: "LIMIT",
        price: 120,
        quantity: 2,
        timeInForce: "GTC",
      });

      const res = await place(app, {
        orderId: "b-mkt",
        userId: "buyer",
        side: Side.BUY,
        type: "MARKET",
        price: 0,
        quantity: 10,
        timeInForce: "IOC",
        quoteBudget: 250,
      });
      const placed = await body(res);
      expect(placed.accepted).toBe(true);
      expect(placed.order).toMatchObject({
        status: "CANCELLED",
        filledQuantity: 2,
      });
      expect(runtime.book.getOrder("b-mkt")).toBeUndefined();
      expect(runtime.balances.get("buyer", "USD")).toMatchObject({
        available: 300,
        locked: 0,
      });
      expect(runtime.book.getSnapshot().asks[0]).toEqual({
        price: 120,
        quantity: 2,
        count: 1,
      });
    });

    it("MARKET buy without quoteBudget is rejected", async () => {
      const { app } = createExchange();
      await credit(app, "buyer", "USD", 100);

      const res = await place(app, {
        orderId: "b-no-budget",
        userId: "buyer",
        side: Side.BUY,
        type: "MARKET",
        price: 0,
        quantity: 1,
        timeInForce: "IOC",
      });
      expect(res.status).toBe(400);
      const placed = await body(res);
      expect(
        (placed.error as { code: string }).code,
      ).toBe("MARKET_MISSING_QUOTE_BUDGET");
    });
  });

  describe("9. Rejects & validation", () => {
    it("rejects place when buyer has insufficient balance", async () => {
      const { app, runtime } = createExchange();
      await credit(app, "buyer", "USD", 50);

      const res = await place(app, {
        orderId: "b-broke",
        userId: "buyer",
        side: Side.BUY,
        type: "LIMIT",
        price: 100,
        quantity: 1,
        timeInForce: "GTC",
      });
      const placed = await body(res);
      expect(placed.accepted).toBe(false);
      expect(placed.order).toMatchObject({ status: "REJECTED" });
      expect(runtime.balances.get("buyer", "USD").available).toBe(50);
    });

    it("supports market-buy FOK_BUDGET", async () => {
      const { app } = createExchange();
      await credit(app, "seller", "SOL", 1);
      await credit(app, "buyer", "USD", 100);
      await place(app, {
        orderId: "budget-maker",
        userId: "seller",
        side: Side.SELL,
        type: "LIMIT",
        price: 100,
        quantity: 1,
        timeInForce: "GTC",
      });

      const res = await place(app, {
        orderId: "b-budget",
        userId: "buyer",
        side: Side.BUY,
        type: "MARKET",
        price: 0,
        quantity: 1,
        timeInForce: "FOK_BUDGET",
        quoteBudget: 100,
      });
      const placed = await body(res);
      expect(placed.accepted).toBe(true);
      expect(placed.order).toMatchObject({ status: "FILLED" });
    });
  });

  describe("10. Order queries", () => {
    it("GET order by id, open orders by user, and full history list", async () => {
      const { app } = createExchange();
      await credit(app, "seller", "SOL", 2);
      await credit(app, "buyer", "USD", 200);

      await place(app, {
        orderId: "q-s1",
        userId: "seller",
        side: Side.SELL,
        type: "LIMIT",
        price: 100,
        quantity: 2,
        timeInForce: "GTC",
      });
      await place(app, {
        orderId: "q-b1",
        userId: "buyer",
        side: Side.BUY,
        type: "LIMIT",
        price: 100,
        quantity: 1,
        timeInForce: "GTC",
      });

      const one = await body(
        await app.request("/v1/markets/SOL-USD/orders/q-b1"),
      );
      expect(one.order).toMatchObject({
        orderId: "q-b1",
        status: "FILLED",
      });

      const open = await body(
        await app.request(
          "/v1/markets/SOL-USD/orders?userId=seller&openOnly=true",
        ),
      );
      expect(open.orders).toHaveLength(1);
      expect((open.orders as { orderId: string }[])[0]?.orderId).toBe("q-s1");

      const allSeller = await body(
        await app.request("/v1/markets/SOL-USD/orders?userId=seller"),
      );
      expect(allSeller.orders).toHaveLength(1);
    });
  });

  describe("11. Live EventBus signals (SSE source)", () => {
    it("publishes CREDIT, ORDER, and BBO on credit/place", async () => {
      const { app, bus } = createExchange();
      const kinds: string[] = [];
      const orderTypes: string[] = [];
      const unsub = bus.subscribe((e) => {
        kinds.push(e.kind);
        if (e.kind === "ORDER") orderTypes.push(e.event.type);
      });

      await credit(app, "seller", "SOL", 1);
      await place(app, {
        orderId: "ev-s1",
        userId: "seller",
        side: Side.SELL,
        type: "LIMIT",
        price: 100,
        quantity: 1,
        timeInForce: "GTC",
      });
      unsub();

      expect(kinds).toEqual(expect.arrayContaining(["CREDIT", "ORDER", "BBO"]));
      expect(orderTypes).toContain("RESTING");
    });
  });

  describe("12. WAL durability — process restart", () => {
    it("rebuilds book, balances, and orders from WAL after restart", async () => {
      const walPath = tempWal();
      const live = MarketRuntime.open("SOL-USD", walPath, new EventBus());
      const app = createExchangeApp(live, new EventBus());

      await credit(app, "seller", "SOL", 5);
      await credit(app, "buyer", "USD", 1000);
      await place(app, {
        orderId: "wal-s1",
        userId: "seller",
        side: Side.SELL,
        type: "LIMIT",
        price: 100,
        quantity: 3,
        timeInForce: "GTC",
      });
      await place(app, {
        orderId: "wal-b1",
        userId: "buyer",
        side: Side.BUY,
        type: "LIMIT",
        price: 100,
        quantity: 2,
        timeInForce: "GTC",
      });

      const snapshot = live.book.getSnapshot();
      const walLines = fs
        .readFileSync(walPath, "utf8")
        .trim()
        .split("\n")
        .filter(Boolean);
      expect(walLines.length).toBeGreaterThanOrEqual(4);

      // crash simulation: new process, same file
      await live.close();
      const restarted = MarketRuntime.open("SOL-USD", walPath);
      expect(restarted.book.getSnapshot()).toEqual(snapshot);
      expect(restarted.queries.getById("wal-s1")).toMatchObject({
        status: "PARTIALLY_FILLED",
        filledQuantity: 2,
      });
      expect(restarted.queries.getById("wal-b1")?.status).toBe("FILLED");
      expect(restarted.balances.get("seller", "SOL")).toEqual({
        userId: "seller",
        asset: "SOL",
        available: 2,
        locked: 1,
      });
      expect(restarted.balances.get("buyer", "SOL").available).toBe(2);
      expect(
        fs.readFileSync(walPath, "utf8").trim().split("\n").filter(Boolean),
      ).toHaveLength(walLines.length);
      await restarted.close();
    });

    it("persists cancel across a second restart", async () => {
      const walPath = tempWal();
      let runtime = MarketRuntime.open("SOL-USD", walPath);
      let app = createExchangeApp(runtime, new EventBus());

      await credit(app, "seller", "SOL", 2);
      await place(app, {
        orderId: "wal-cx",
        userId: "seller",
        side: Side.SELL,
        type: "LIMIT",
        price: 100,
        quantity: 2,
        timeInForce: "GTC",
      });

      await runtime.close();
      runtime = MarketRuntime.open("SOL-USD", walPath);
      app = createExchangeApp(runtime, new EventBus());
      expect((await body(await cancel(app, "wal-cx"))).cancelled).toBe(true);

      await runtime.close();
      const again = MarketRuntime.open("SOL-USD", walPath);
      expect(again.book.getOrder("wal-cx")).toBeUndefined();
      expect(again.queries.getById("wal-cx")?.status).toBe("CANCELLED");
      expect(again.balances.get("seller", "SOL")).toEqual({
        userId: "seller",
        asset: "SOL",
        available: 2,
        locked: 0,
      });
      await again.close();
    });
  });
});
