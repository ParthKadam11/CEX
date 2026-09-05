import { Hono, type Context } from "hono";
import { streamSSE } from "hono/streaming";
import {
  isBoundedPositiveInteger,
  isIdentifier,
  isMarketSymbol,
  MAX_ORDER_PRICE,
  MAX_ORDER_QUANTITY,
  MAX_QUOTE_BUDGET,
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
import { isPositiveUnit, isUnit, marketSpec } from "../market/units.js";

function isMarket(value: string): value is MarketSymbol {
  return isMarketSymbol(value);
}

function parseSide(value: unknown): Side | null {
  if (value === Side.BUY || value === "BUY") return Side.BUY;
  if (value === Side.SELL || value === "SELL") return Side.SELL;
  return null;
}

function parseOrderType(value: unknown): OrderType | null {
  if (value === undefined) return OrderType.LIMIT;
  if (value === OrderType.MARKET || value === "MARKET") return OrderType.MARKET;
  if (value === OrderType.LIMIT || value === "LIMIT") return OrderType.LIMIT;
  return null;
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

export function createExchangeApp(
  runtime: MarketRuntime,
  bus: EventBus,
  options: { gatewayToken?: string } = {},
) {
  const app = new Hono();

  app.use("*", async (c, next) => {
    const requestId = c.req.header("x-request-id");
    c.header(
      "x-request-id",
      isIdentifier(requestId) ? requestId : crypto.randomUUID(),
    );

    if (c.req.path === "/health" || !options.gatewayToken) {
      await next();
      return;
    }

    if (c.req.header("x-gateway-token") !== options.gatewayToken) {
      return errorResponse(c, 401, "UNAUTHORIZED");
    }
    await next();
  });

  app.onError((error, c) =>
    errorResponse(
      c,
      500,
      "INTERNAL_ERROR",
      error instanceof Error ? error.message : "INTERNAL_ERROR",
    ),
  );

  app.get("/health", (c) => c.json({ ok: true, market: runtime.market }));

  // Dev hard-reset: empty book + balances + WAL (not for production).
  app.post("/v1/dev/reset", async (c) => {
    if (process.env.NODE_ENV === "production") {
      return errorResponse(c, 404, "NOT_FOUND");
    }
    await runtime.hardReset();
    return c.json({
      ok: true,
      market: runtime.market,
      book: runtime.book.getSnapshot(0),
    });
  });

  app.post("/v1/markets/:market/credit", async (c) => {
    const market = c.req.param("market");
    if (!isMarket(market) || market !== runtime.market) {
      return errorResponse(c, 404, "UNKNOWN_MARKET");
    }

    let body: {
      userId?: string;
      asset?: AssetId;
      amount?: number;
    };
    try {
      body = await c.req.json();
    } catch {
      return errorResponse(c, 400, "INVALID_JSON");
    }

    if (
      !isIdentifier(body.userId) ||
      !body.asset ||
      body.amount === undefined
    ) {
      return errorResponse(c, 400, "INVALID_BODY");
    }
    const amount = parsePositiveUnit(body.amount);
    if (amount === null || !isBoundedPositiveInteger(amount, MAX_QUOTE_BUDGET)) {
      return errorResponse(c, 400, "INVALID_UNITS");
    }
    if (body.asset !== "SOL" && body.asset !== "USD") {
      return errorResponse(c, 400, "INVALID_ASSET");
    }

    const result = await runtime.credit(body.userId, body.asset, amount);
    return c.json({ balance: result.balance, entry: result.entry });
  });

  app.post("/v1/markets/:market/orders", async (c) => {
    const market = c.req.param("market");
    if (!isMarket(market) || market !== runtime.market) {
      return errorResponse(c, 404, "UNKNOWN_MARKET");
    }

    let body: Record<string, unknown>;
    try {
      body = await c.req.json();
    } catch {
      return errorResponse(c, 400, "INVALID_JSON");
    }
    const side = parseSide(body.side);
    const tif = parseTif(body.timeInForce ?? "GTC");
    const quantity = parsePositiveUnit(body.quantity);
    const userId = isIdentifier(body.userId) ? body.userId : "";

    if (!side || !tif || !userId) {
      return errorResponse(c, 400, "INVALID_BODY");
    }
    if (
      quantity === null ||
      !isBoundedPositiveInteger(quantity, MAX_ORDER_QUANTITY)
    ) {
      return errorResponse(
        c,
        400,
        body.quantity === undefined ? "INVALID_BODY" : "INVALID_UNITS",
      );
    }

    const type = parseOrderType(body.type);
    if (!type) return errorResponse(c, 400, "INVALID_ORDER_TYPE");
    const price =
      type === OrderType.MARKET
        ? parseNonNegativeUnit(body.price ?? 0)
        : parsePositiveUnit(body.price);
    if (
      price === null ||
      (type === OrderType.MARKET && price !== 0) ||
      (type === OrderType.LIMIT &&
        !isBoundedPositiveInteger(price, MAX_ORDER_PRICE))
    ) {
      return errorResponse(
        c,
        400,
        type === OrderType.LIMIT ? "INVALID_PRICE" : "INVALID_UNITS",
      );
    }

    let quoteBudget: number | undefined;
    if (body.quoteBudget !== undefined) {
      const parsed = parsePositiveUnit(body.quoteBudget);
      if (
        parsed === null ||
        !isBoundedPositiveInteger(parsed, MAX_QUOTE_BUDGET)
      ) {
        return errorResponse(c, 400, "INVALID_UNITS");
      }
      quoteBudget = parsed;
    }

    if (
      type === OrderType.MARKET &&
      side === Side.BUY &&
      market === "SOL-USD" &&
      quoteBudget === undefined
    ) {
      return errorResponse(c, 400, "MARKET_MISSING_QUOTE_BUDGET");
    }
    if (
      type === OrderType.MARKET &&
      market !== "SOL-USD" &&
      quoteBudget === undefined
    ) {
      return errorResponse(c, 400, "MARKET_MISSING_QUOTE_BUDGET");
    }
    if (
      tif === TimeInForce.FOK_BUDGET &&
      (type !== OrderType.MARKET ||
        side !== Side.BUY ||
        quoteBudget === undefined)
    ) {
      return errorResponse(c, 400, "FOK_BUDGET_REQUIRES_MARKET_BUY");
    }
    if (body.orderId !== undefined && !isIdentifier(body.orderId)) {
      return errorResponse(c, 400, "INVALID_ORDER_ID");
    }

    let leverage: number | undefined;
    if (body.leverage !== undefined) {
      const parsed = parsePositiveUnit(body.leverage);
      const spec = marketSpec(market);
      const maxLev = spec.maxLeverage ?? 1;
      if (parsed === null || parsed > maxLev || spec.kind !== "PERP") {
        return errorResponse(c, 400, "INVALID_LEVERAGE");
      }
      leverage = parsed;
    }

    const order: Order = {
      orderId:
        isIdentifier(body.orderId)
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
      leverage,
      filledQuantity: 0,
      status: "NEW",
      timestamp: Date.now(),
    };

    const result = await runtime.place(order);
    if (!result.accepted) {
      return c.json(
        {
          ...errorBody(c, result.reason ?? "ORDER_REJECTED"),
          order: result.order,
          trades: result.trades,
          accepted: false,
        },
        400,
      );
    }
    return c.json(result, 200);
  });

  app.delete("/v1/markets/:market/orders/:orderId", async (c) => {
    const market = c.req.param("market");
    if (!isMarket(market) || market !== runtime.market) {
      return errorResponse(c, 404, "UNKNOWN_MARKET");
    }

    const orderId = c.req.param("orderId");
    if (!isIdentifier(orderId)) {
      return errorResponse(c, 400, "INVALID_ORDER_ID");
    }
    const result = await runtime.cancel(orderId);
    if (!result.cancelled) {
      return errorResponse(c, 404, result.reason ?? "CANCEL_FAILED");
    }
    return c.json(result, 200);
  });

  app.get("/v1/markets/:market/orders/:orderId", (c) => {
    const market = c.req.param("market");
    if (!isMarket(market) || market !== runtime.market) {
      return errorResponse(c, 404, "UNKNOWN_MARKET");
    }

    const orderId = c.req.param("orderId");
    if (!isIdentifier(orderId)) {
      return errorResponse(c, 400, "INVALID_ORDER_ID");
    }
    const order = runtime.queries.getById(orderId);
    if (!order) return errorResponse(c, 404, "UNKNOWN_ORDER");
    return c.json({ order });
  });

  app.get("/v1/markets/:market/orders", (c) => {
    const market = c.req.param("market");
    if (!isMarket(market) || market !== runtime.market) {
      return errorResponse(c, 404, "UNKNOWN_MARKET");
    }

    const userId = c.req.query("userId");
    if (!isIdentifier(userId)) {
      return errorResponse(c, 400, "INVALID_USER_ID");
    }

    const openOnly = c.req.query("openOnly") === "true";
    if (
      c.req.query("openOnly") !== undefined &&
      c.req.query("openOnly") !== "true" &&
      c.req.query("openOnly") !== "false"
    ) {
      return errorResponse(c, 400, "INVALID_OPEN_ONLY");
    }
    const orders = openOnly
      ? runtime.queries.getOpenByUser(userId, market)
      : runtime.queries.getByUser(userId, { market });
    return c.json({ orders });
  });

  app.get("/v1/markets/:market/balances/:userId", (c) => {
    const market = c.req.param("market");
    if (!isMarket(market) || market !== runtime.market) {
      return errorResponse(c, 404, "UNKNOWN_MARKET");
    }

    const userId = c.req.param("userId");
    if (!isIdentifier(userId)) {
      return errorResponse(c, 400, "INVALID_USER_ID");
    }
    return c.json({
      balances: runtime.balances.getByUser(userId),
    });
  });

  app.get("/v1/markets/:market/positions", (c) => {
    const market = c.req.param("market");
    if (!isMarket(market) || market !== runtime.market) {
      return errorResponse(c, 404, "UNKNOWN_MARKET");
    }

    const userId = c.req.query("userId");
    if (userId !== undefined && !isIdentifier(userId)) {
      return errorResponse(c, 400, "INVALID_USER_ID");
    }

    const positions = userId
      ? runtime.positions.listByUser(userId).filter((p) => p.market === market)
      : runtime.positions.listByMarket(market);
    return c.json({ positions });
  });

  app.get("/v1/markets/:market/positions/:userId", (c) => {
    const market = c.req.param("market");
    if (!isMarket(market) || market !== runtime.market) {
      return errorResponse(c, 404, "UNKNOWN_MARKET");
    }

    const userId = c.req.param("userId");
    if (!isIdentifier(userId)) {
      return errorResponse(c, 400, "INVALID_USER_ID");
    }

    const position = runtime.positions.get(userId, market);
    return c.json({
      position:
        position ?? {
          userId,
          market,
          size: 0,
          entryPrice: 0,
          margin: 0,
          leverage: 1,
          updatedAt: 0,
        },
    });
  });

  app.get("/v1/markets/:market/book", (c) => {
    const market = c.req.param("market");
    if (!isMarket(market) || market !== runtime.market) {
      return errorResponse(c, 404, "UNKNOWN_MARKET");
    }

    const raw = c.req.query("depth");
    const depth =
      raw === undefined || raw === ""
        ? 0
        : Number(raw);
    if (!Number.isFinite(depth) || depth < 0 || !Number.isInteger(depth)) {
      return errorResponse(c, 400, "INVALID_DEPTH");
    }

    return c.json(runtime.book.getSnapshot(depth));
  });

  // Live stream for gateway: ORDER, TRADE, BBO, CREDIT
  app.get("/v1/markets/:market/stream", (c) => {
    const market = c.req.param("market");
    if (!isMarket(market) || market !== runtime.market) {
      return errorResponse(c, 404, "UNKNOWN_MARKET");
    }

    const userId = c.req.query("userId");
    if (userId !== undefined && !isIdentifier(userId)) {
      return errorResponse(c, 400, "INVALID_USER_ID");
    }

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
        if (
          userId &&
          event.kind === "POSITION" &&
          event.position.userId !== userId
        ) {
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

function errorBody(
  context: Context,
  code: string,
  message = code,
) {
  return {
    error: {
      code,
      message,
      requestId: context.req.header("x-request-id"),
    },
  };
}

function errorResponse(
  context: Context,
  status: 400 | 401 | 404 | 409 | 500,
  code: string,
  message = code,
) {
  return context.json(errorBody(context, code, message), status);
}
