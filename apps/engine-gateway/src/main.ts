import { serve } from "@hono/node-server";
import type { AppOrderEvent } from "@cex/app-contracts";
import type { OrderEvent } from "@cex/exchange-types";
import { loadConfig } from "./config.js";
import { CommandDedupe } from "./dedupe.js";
import { CommandHandler } from "./commands/handler.js";
import { EngineClient } from "./engine/client.js";
import { EngineSseClient } from "./engine/sse.js";
import { createGatewayApp } from "./http/server.js";
import { log } from "./logger.js";
import { GatewayMetrics } from "./metrics.js";
import { publishBbo } from "./redis/pubsub.js";
import {
  createRedisSubscriber,
  MarketDataHub,
} from "./redis/market-data.js";
import {
  ackCommand,
  createRedis,
  deadLetterCommand,
  ensureCommandGroup,
  recoverPendingCommands,
  readCommands,
  publishOrderEvent,
} from "./redis/streams.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const redis = createRedis(config.redisUrl);
  const marketDataRedis = createRedisSubscriber(config.redisUrl);
  const marketData = new MarketDataHub(marketDataRedis, config.market);
  const engine = new EngineClient(config.exchangeUrl, config.market);
  const metrics = new GatewayMetrics();
  const dedupe = new CommandDedupe(redis);
  const handler = new CommandHandler(engine, redis, dedupe, metrics);

  await ensureCommandGroup(redis);
  await marketData.start();
  log("info", "redis command group ready");

  try {
    const health = await engine.health();
    log("info", "exchange reachable", health);
  } catch (err) {
    log("warn", "exchange not reachable yet", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const sse = new EngineSseClient(engine.streamUrl(), async (event) => {
    if (event.kind === "BBO") {
      try {
        await publishBbo(redis, {
          market: event.market,
          bestBid: event.bestBid,
          bestAsk: event.bestAsk,
          timestamp: Date.now(),
        });
        metrics.increment("bboPublished");
        log("info", "BBO published", { market: event.market });
      } catch (err) {
        log("error", "BBO publish failed", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
      return;
    }

    if (event.kind === "ORDER") {
      const appEvent = toAppOrderEvent(event.event);
      if (appEvent) {
        try {
          await publishOrderEvent(redis, appEvent);
          metrics.increment("eventsPublished");
        } catch (err) {
          log("error", "exchange order event publish failed", {
            orderId: event.event.orderId,
            sequence: event.event.seq,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
      return;
    }

    log("info", "SSE event received", { kind: event.kind });
  }, {
    onConnectionChange: (connected) => metrics.setSseConnected(connected),
    onReconnect: () => metrics.increment("sseReconnects"),
  });
  sse.start();

  let commandsRunning = true;
  const commandLoop = (async () => {
    while (commandsRunning) {
      try {
        const pending = await recoverPendingCommands(
          redis,
          config.consumerName,
        );
        const batch = [
          ...pending,
          ...(await readCommands(redis, config.consumerName)),
        ];

        for (const msg of batch) {
          if ("command" in msg) {
            metrics.increment("commandsReceived");
            await handler.handle(msg.command);
          } else {
            await deadLetterCommand(redis, msg);
            metrics.increment("commandsDeadLettered");
            log("warn", "command moved to dead-letter stream", {
              messageId: msg.id,
              reason: msg.reason,
            });
          }
          await ackCommand(redis, msg.id);
        }
      } catch (err) {
        if (!commandsRunning) return;
        log("error", "command loop error", {
          error: err instanceof Error ? err.message : String(err),
        });
        await sleep(1000);
      }
    }
  })();

  const app = createGatewayApp({
    redis,
    engine,
    market: config.market,
    metrics,
    isSseConnected: () => metrics.snapshot().sseConnected === true,
    marketData,
    internalToken: config.internalToken,
  });
  const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
    log("info", "HTTP server listening", {
      port: info.port,
      exchangeUrl: config.exchangeUrl,
    });
  });

  const shutdown = async () => {
    log("info", "shutting down");
    commandsRunning = false;
    sse.stop();
    server.close();
    await commandLoop.catch(() => undefined);
    redis.disconnect();
    await marketData.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((err) => {
  log("error", "fatal startup error", {
    error: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});

function toAppOrderEvent(event: OrderEvent): AppOrderEvent | null {
  if (event.type === "STATUS") return null;

  return {
    eventId: `exchange-${event.seq}-${event.orderId}-${event.type}`,
    type: event.type,
    userId: event.userId,
    market: event.market,
    orderId: event.orderId,
    status: event.status,
    reason: event.reason,
    fills:
      event.type === "FILL" && event.tradeId && event.price && event.quantity
        ? [
            {
              tradeId: event.tradeId,
              price: event.price,
              quantity: event.quantity,
            },
          ]
        : undefined,
    timestamp: event.timestamp,
  };
}
