import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import {
  OrderType,
  Side,
  TimeInForce,
  type AssetId,
  type ExchangeStreamEvent,
  type MarketSymbol,
  type Order,
} from "@cex/exchange-types";
import type { EventBus } from "./eventBus.js";
import type { MarketRuntime } from "../market/runtime.js";
import { isPositiveUnit, isUnit } from "../market/units.js";

function isMarket(value: string): value is MarketSymbol {
  return value === "SOL-USD";
}

function parseSide(value: unknown): Side | null {
  if (value === Side.BUY || value === "BUY") return Side.BUY;
  if (value === Side.SELL || value === "SELL") return Side.SELL;
  return null;
}

function parseOrderType(value: unknown): OrderType {
  if (value === OrderType.MARKET || value === "MARKET") return OrderType.MARKET;
  return OrderType.LIMIT;
}

function parseTif(value: unknown): TimeInForce | null {
  if (value === TimeInForce.GTC || value === "GTC") return TimeInForce.GTC;
  if (value === TimeInForce.IOC || value === "IOC") return TimeInForce.IOC;
  if (value === TimeInForce.FOK || value === "FOK") return TimeInForce.FOK;
  if (value === TimeInForce.FOK_BUDGET || value === "FOK_BUDGET") {
    return TimeInForce.FOK_BUDGET;
  }
  return null;
}

function parsePositiveUnit(value: unknown): number | null {
  return typeof value === "number" && isPositiveUnit(value) ? value : null;
}

function parseNonNegativeUnit(value: unknown): number | null {
  return typeof value === "number" && isUnit(value) ? value : null;
}

/*
  REST = commands + queries (this is your request/response "RPC").
  SSE  = live ORDER / BBO / CREDIT events for the gateway.
*/

export function createExchangeApp(runtime: MarketRuntime, bus: EventBus) {
  const app = new Hono();

  app.get("/health", (c) => c.json({ ok: true, market: runtime.market }));

  app.post("/v1/markets/:market/credit", async (c) => {
    const market = c.req.param("market");
    if (!isMarket(market) || market !== runtime.market) {
      return c.json({ error: "UNKNOWN_MARKET" }, 404);
    }

    const body = await c.req.json<{
      userId?: string;
      asset?: AssetId;
      amount?: number;
    }>();

    if (!body.userId || !body.asset || body.amount === undefined) {
      return c.json({ error: "INVALID_BODY" }, 400);
    }
    const amount = parsePositiveUnit(body.amount);
    if (amount === null) {
      return c.json({ error: "INVALID_UNITS" }, 400);
    }
    if (body.asset !== "SOL" && body.asset !== "USD") {
      return c.json({ error: "INVALID_ASSET" }, 400);
    }

    const result = await runtime.credit(body.userId, body.asset, amount);
    return c.json({ balance: result.balance, entry: result.entry });
  });

  app.post("/v1/markets/:market/orders", async (c) => {
    const market = c.req.param("market");
    if (!isMarket(market) || market !== runtime.market) {
      return c.json({ error: "UNKNOWN_MARKET" }, 404);
    }

    const body = await c.req.json<Record<string, unknown>>();
    const side = parseSide(body.side);
    const tif = parseTif(body.timeInForce ?? "GTC");
    const quantity = parsePositiveUnit(body.quantity);
    const userId = typeof body.userId === "string" ? body.userId : "";

    if (!side || !tif || !userId) {
      return c.json({ error: "INVALID_BODY" }, 400);
    }
    if (quantity === null) {
      return c.json(
        {
          error:
            body.quantity === undefined ? "INVALID_BODY" : "INVALID_UNITS",
        },
        400,
      );
    }

    const type = parseOrderType(body.type);
    const price =
      type === OrderType.MARKET
        ? parseNonNegativeUnit(body.price ?? 0)
        : parsePositiveUnit(body.price);
    if (price === null || (type === OrderType.MARKET && price !== 0)) {
      return c.json({ error: type === OrderType.LIMIT ? "INVALID_PRICE" : "INVALID_UNITS" }, 400);
    }

    let quoteBudget: number | undefined;
    if (body.quoteBudget !== undefined) {
      const parsed = parsePositiveUnit(body.quoteBudget);
      if (parsed === null) return c.json({ error: "INVALID_UNITS" }, 400);
      quoteBudget = parsed;
    }

    const order: Order = {
      orderId:
        typeof body.orderId === "string" && body.orderId.length > 0
          ? body.orderId
          : crypto.randomUUID(),
      userId,
      market,
      side,
      type,
      timeInForce: tif,
      price,
      quantity,
      quoteBudget,
      filledQuantity: 0,
      status: "NEW",
      timestamp: Date.now(),
    };

    const result = await runtime.place(order);
    return c.json(result, result.accepted ? 200 : 400);
  });

  app.delete("/v1/markets/:market/orders/:orderId", async (c) => {
    const market = c.req.param("market");
    if (!isMarket(market) || market !== runtime.market) {
      return c.json({ error: "UNKNOWN_MARKET" }, 404);
    }

    const result = await runtime.cancel(c.req.param("orderId"));
    return c.json(result, result.cancelled ? 200 : 400);
  });

  app.get("/v1/markets/:market/orders/:orderId", (c) => {
    const market = c.req.param("market");
    if (!isMarket(market) || market !== runtime.market) {
      return c.json({ error: "UNKNOWN_MARKET" }, 404);
    }

    const order = runtime.queries.getById(c.req.param("orderId"));
    if (!order) return c.json({ error: "UNKNOWN_ORDER" }, 404);
    return c.json({ order });
  });

  app.get("/v1/markets/:market/orders", (c) => {
    const market = c.req.param("market");
    if (!isMarket(market) || market !== runtime.market) {
      return c.json({ error: "UNKNOWN_MARKET" }, 404);
    }

    const userId = c.req.query("userId");
    if (!userId) return c.json({ error: "userId required" }, 400);

    const openOnly = c.req.query("openOnly") === "true";
    const orders = openOnly
      ? runtime.queries.getOpenByUser(userId, market)
      : runtime.queries.getByUser(userId, { market });
    return c.json({ orders });
  });

  app.get("/v1/markets/:market/balances/:userId", (c) => {
    const market = c.req.param("market");
    if (!isMarket(market) || market !== runtime.market) {
      return c.json({ error: "UNKNOWN_MARKET" }, 404);
    }

    return c.json({
      balances: runtime.balances.getByUser(c.req.param("userId")),
    });
  });

  app.get("/v1/markets/:market/book", (c) => {
    const market = c.req.param("market");
    if (!isMarket(market) || market !== runtime.market) {
      return c.json({ error: "UNKNOWN_MARKET" }, 404);
    }

    return c.json(runtime.book.getSnapshot());
  });

  // Live stream for gateway: ORDER events, BBO, CREDIT
  app.get("/v1/markets/:market/stream", (c) => {
    const market = c.req.param("market");
    if (!isMarket(market) || market !== runtime.market) {
      return c.json({ error: "UNKNOWN_MARKET" }, 404);
    }

    const userId = c.req.query("userId");

    return streamSSE(c, async (stream) => {
      await stream.writeSSE({
        event: "ready",
        data: JSON.stringify({ market, userId: userId ?? null }),
      });

      const onEvent = async (event: ExchangeStreamEvent) => {
        if (event.market !== market) return;
        if (
          userId &&
          event.kind === "ORDER" &&
          event.event.userId !== userId
        ) {
          return;
        }
        if (userId && event.kind === "CREDIT" && event.userId !== userId) {
          return;
        }

        await stream.writeSSE({
          event: event.kind,
          data: JSON.stringify(event),
        });
      };

      const unsubscribe = bus.subscribe((event) => {
        void onEvent(event);
      });

      // keep the stream open until the client disconnects
      await new Promise<void>((resolve) => {
        stream.onAbort(() => {
          unsubscribe();
          resolve();
        });
      });
    });
  });

  return app;
}
