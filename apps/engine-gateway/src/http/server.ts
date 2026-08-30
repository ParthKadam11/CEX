import { Hono } from "hono";
import type Redis from "ioredis";
import { isAppCommand } from "@cex/app-contracts";
import type { MarketSymbol } from "@cex/exchange-types";
import type { EngineClient } from "../engine/client.js";
import type { GatewayMetrics } from "../metrics.js";
import { injectCommand } from "../redis/streams.js";

type GatewayAppOptions = {
  redis: Redis;
  engine: EngineClient;
  market: MarketSymbol;
  metrics: GatewayMetrics;
  isSseConnected: () => boolean;
};

export function createGatewayApp(options: GatewayAppOptions) {
  const app = new Hono();

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
