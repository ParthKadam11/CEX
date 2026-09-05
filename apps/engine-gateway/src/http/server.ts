import { Hono, type Context } from "hono";
import { streamSSE } from "hono/streaming";
import type Redis from "ioredis";
import { isAppCommand } from "@cex/app-contracts";
import { isIdentifier, type MarketSymbol } from "@cex/exchange-types";
import type { EngineClient } from "../engine/client.js";
import type { GatewayMetrics } from "../metrics.js";
import type { LiveBookHub } from "../redis/live-book.js";
import type { MarketDataHub } from "../redis/market-data.js";
import { injectCommand } from "../redis/streams.js";

type GatewayAppOptions = {
  redis: Redis;
  engine: EngineClient;
  market: MarketSymbol;
  metrics: GatewayMetrics;
  isSseConnected: () => boolean;
  marketData: MarketDataHub;
  liveBook: LiveBookHub;
  internalToken: string | null;
};

export function createGatewayApp(options: GatewayAppOptions) {
  const app = new Hono();

  app.use("*", async (c, next) => {
    const requestId = c.req.header("x-request-id");
    c.header(
      "x-request-id",
      isIdentifier(requestId) ? requestId : crypto.randomUUID(),
    );

    if (
      !options.internalToken ||
      c.req.path === "/health" ||
      c.req.path === "/metrics"
    ) {
      await next();
      return;
    }

    if (c.req.header("x-internal-token") !== options.internalToken) {
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

  app.get("/markets/:market", (c) => {
    if (c.req.param("market") !== options.market) {
      return errorResponse(c, 404, "UNKNOWN_MARKET");
    }

    return c.json({
      market: options.market,
      base: "SOL",
      quote: "USD",
      tickSize: 1,
      lotSize: 1,
      status: "OPEN",
    });
  });

  app.get("/markets/:market/book", async (c) => {
    if (c.req.param("market") !== options.market) {
      return errorResponse(c, 404, "UNKNOWN_MARKET");
    }

    try {
      return c.json(await options.engine.book());
    } catch (error) {
      return errorResponse(
        c,
        502,
        "BOOK_UNAVAILABLE",
        error instanceof Error ? error.message : "BOOK_UNAVAILABLE",
      );
    }
  });

  app.get("/markets/:market/orders", async (c) => {
    if (c.req.param("market") !== options.market) {
      return errorResponse(c, 404, "UNKNOWN_MARKET");
    }

    const userId = c.req.query("userId");
    if (!isIdentifier(userId)) {
      return errorResponse(c, 400, "INVALID_USER_ID");
    }

    try {
      return c.json({
        orders: await options.engine.openOrders(userId),
      });
    } catch (error) {
      return errorResponse(
        c,
        502,
        "ORDERS_UNAVAILABLE",
        error instanceof Error ? error.message : "ORDERS_UNAVAILABLE",
      );
    }
  });

  app.get("/markets/:market/balances", async (c) => {
    if (c.req.param("market") !== options.market) {
      return errorResponse(c, 404, "UNKNOWN_MARKET");
    }

    const userId = c.req.header("x-authenticated-user-id");
    if (!isIdentifier(userId)) {
      return errorResponse(c, 401, "UNAUTHORIZED");
    }

    try {
      return c.json({
        balances: await options.engine.balances(userId),
      });
    } catch (error) {
      return errorResponse(
        c,
        502,
        "BALANCES_UNAVAILABLE",
        error instanceof Error ? error.message : "BALANCES_UNAVAILABLE",
      );
    }
  });

  app.get("/markets/:market/stream", (c) => {
    if (c.req.param("market") !== options.market) {
      return errorResponse(c, 404, "UNKNOWN_MARKET");
    }

    return streamSSE(c, async (stream) => {
      const unsubscribers: Array<() => void> = [];
      try {
        unsubscribers.push(
          options.marketData.subscribe((message) => {
            void stream
              .writeSSE({
                event: "tradeId" in message ? "trade" : "bbo",
                data: JSON.stringify(message),
              })
              .catch(() => undefined);
          }),
        );
        unsubscribers.push(
          options.liveBook.subscribe((book) => {
            void stream
              .writeSSE({
                event: "book",
                data: JSON.stringify(book),
              })
              .catch(() => undefined);
          }),
        );

        await stream.writeSSE({
          event: "ready",
          data: JSON.stringify({ market: options.market }),
        });

        await new Promise<void>((resolve) => {
          stream.onAbort(resolve);
        });
      } finally {
        for (const unsubscribe of unsubscribers) unsubscribe();
      }
    });
  });

  app.get("/health", async (c) => {
    const redisOk = options.redis.status === "ready";
    const engineOk = await checkEngine(options.engine);
    const sseOk = options.isSseConnected();
    const ok = redisOk && engineOk && sseOk;

    return c.json({
      ok,
      service: "engine-gateway",
      market: options.market,
      dependencies: {
        redis: redisOk,
        engine: engineOk,
        sse: sseOk,
      },
      metrics: options.metrics.snapshot(),
    });
  });

  app.get("/metrics", (c) =>
    c.json({
      service: "engine-gateway",
      uptimeSeconds: Math.floor(process.uptime()),
      ...options.metrics.snapshot(),
    }),
  );

  app.post("/dev/inject-command", async (c) => {
    if (process.env.NODE_ENV === "production") {
      return errorResponse(c, 404, "DISABLED_IN_PRODUCTION");
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return errorResponse(c, 400, "INVALID_JSON");
    }

    if (!isAppCommand(body)) {
      return errorResponse(c, 400, "INVALID_COMMAND");
    }

    const streamId = await injectCommand(options.redis, body);
    return c.json({ streamId }, 202);
  });

  return app;
}

function errorResponse(
  context: Context,
  status: 400 | 401 | 404 | 409 | 500 | 502,
  code: string,
  message = code,
) {
  return context.json(
    {
      error: {
        code,
        message,
        requestId: context.req.header("x-request-id"),
      },
    },
    status,
  );
}

async function checkEngine(engine: EngineClient): Promise<boolean> {
  try {
    await Promise.race([
      engine.health(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("health timeout")), 2_000),
      ),
    ]);
    return true;
  } catch {
    return false;
  }
}
