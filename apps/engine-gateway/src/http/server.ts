import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type Redis from "ioredis";
import { isAppCommand } from "@cex/app-contracts";
import type { MarketSymbol } from "@cex/exchange-types";
import type { EngineClient } from "../engine/client.js";
import type { GatewayMetrics } from "../metrics.js";
import type { MarketDataHub } from "../redis/market-data.js";
import { injectCommand } from "../redis/streams.js";

type GatewayAppOptions = {
  redis: Redis;
  engine: EngineClient;
  market: MarketSymbol;
  metrics: GatewayMetrics;
  isSseConnected: () => boolean;
  marketData: MarketDataHub;
  internalToken: string | null;
};

export function createGatewayApp(options: GatewayAppOptions) {
  const app = new Hono();

  app.use("*", async (c, next) => {
    if (
      !options.internalToken ||
      c.req.path === "/health" ||
      c.req.path === "/metrics"
    ) {
      await next();
      return;
    }

    if (c.req.header("x-internal-token") !== options.internalToken) {
      return c.json({ error: "UNAUTHORIZED" }, 401);
    }
    await next();
  });

  app.get("/markets/:market", (c) => {
    if (c.req.param("market") !== options.market) {
      return c.json({ error: "UNKNOWN_MARKET" }, 404);
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
      return c.json({ error: "UNKNOWN_MARKET" }, 404);
    }

    try {
      return c.json(await options.engine.book());
    } catch (error) {
      return c.json(
        {
          error: error instanceof Error ? error.message : "BOOK_UNAVAILABLE",
        },
        502,
      );
    }
  });

  app.get("/markets/:market/balances/:userId", async (c) => {
    if (c.req.param("market") !== options.market) {
      return c.json({ error: "UNKNOWN_MARKET" }, 404);
    }

    try {
      return c.json({
        balances: await options.engine.balances(c.req.param("userId")),
      });
    } catch (error) {
      return c.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "BALANCES_UNAVAILABLE",
        },
        502,
      );
    }
  });

  app.get("/markets/:market/stream", (c) => {
    if (c.req.param("market") !== options.market) {
      return c.json({ error: "UNKNOWN_MARKET" }, 404);
    }

    return streamSSE(c, async (stream) => {
      let unsubscribe: (() => void) | undefined;
      try {
        unsubscribe = options.marketData.subscribe((message) => {
          void stream
            .writeSSE({
              event: "tradeId" in message ? "trade" : "bbo",
              data: JSON.stringify(message),
            })
            .catch(() => undefined);
        });

        await stream.writeSSE({
          event: "ready",
          data: JSON.stringify({ market: options.market }),
        });
        await stream.writeSSE({
          event: "book",
          data: JSON.stringify(await options.engine.book()),
        });

        await new Promise<void>((resolve) => {
          stream.onAbort(resolve);
        });
      } finally {
        unsubscribe?.();
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
      return c.json({ error: "DISABLED_IN_PRODUCTION" }, 404);
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "INVALID_JSON" }, 400);
    }

    if (!isAppCommand(body)) {
      return c.json({ error: "INVALID_COMMAND" }, 400);
    }

    const streamId = await injectCommand(options.redis, body);
    return c.json({ streamId }, 202);
  });

  return app;
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
