import { serve } from "@hono/node-server";
import { loadConfig } from "./config.js";
import { CommandDedupe } from "./dedupe.js";
import { CommandHandler } from "./commands/handler.js";
import {
  toAppFundingEvent,
  toAppLiquidationEvent,
  toAppOrderEvent,
  toAppPositionEvent,
} from "./engine/events.js";
import { EngineRegistry } from "./engine/registry.js";
import { EngineSseClient } from "./engine/sse.js";
import { createGatewayApp } from "./http/server.js";
import { log } from "./logger.js";
import { GatewayMetrics } from "./metrics.js";
import { publishBboSnapshot, publishTradeTick } from "./redis/market-publisher.js";
import {
  createRedisSubscriber,
  MarketDataHub,
} from "./redis/market-data.js";
import { LiveBookHub } from "./redis/live-book.js";
import { PositionHub } from "./redis/position-hub.js";
import { LiquidationHub } from "./redis/liquidation-hub.js";
import { FundingHub } from "./redis/funding-hub.js";
import {
  ackCommand,
  createRedis,
  deadLetterCommand,
  ensureCommandGroup,
  recoverPendingCommands,
  readCommands,
  publishOrderEvent,
} from "./redis/streams.js";
import { reconcileSseGap } from "./sse/gapReconcile.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const redis = createRedis(config.redisUrl);
  const marketDataRedis = createRedisSubscriber(config.redisUrl);
  const markets = config.engines.map((e) => e.market);
  const marketData = new MarketDataHub(marketDataRedis, markets);
  const engines = new EngineRegistry(
    config.engines,
    config.exchangeToken,
  );
  const liveBook = new LiveBookHub(engines, marketData);
  const positions = new PositionHub();
  const liquidations = new LiquidationHub();
  const fundings = new FundingHub();
  const metrics = new GatewayMetrics();
  const dedupe = new CommandDedupe(redis);
  const handler = new CommandHandler(
    engines,
    config.primaryMarket,
    redis,
    dedupe,
    metrics,
  );
  const gapDeps = {
    redis,
    metrics,
    liveBook,
    positions,
    liquidations,
    fundings,
  };

  await ensureCommandGroup(redis);
  await marketData.start();
  liveBook.start();
  log("info", "redis command group ready", {
    markets,
    primaryMarket: config.primaryMarket,
  });

  for (const engine of engines.all()) {
    try {
      const health = await engine.health();
      log("info", "exchange reachable", health);
    } catch (err) {
      log("warn", "exchange not reachable yet", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const sseClients: EngineSseClient[] = [];
  let connectedCount = 0;
  const refreshSseMetric = () =>
    metrics.setSseConnected(connectedCount === engines.all().length);

  for (const engine of engines.all()) {
    const sse = new EngineSseClient(
      (afterSeq) => engine.streamUrl(afterSeq),
      async (event) => {
        if (event.kind === "ready") {
          if (event.gap) {
            try {
              await reconcileSseGap(engine, gapDeps);
              metrics.increment("sseGapReconciles");
            } catch (err) {
              log("error", "SSE ready-gap reconcile failed", {
                market: event.market,
                error: err instanceof Error ? err.message : String(err),
              });
              liveBook.notify(event.market);
            }
          }
          return;
        }

        if (event.kind === "gap") {
          log("warn", "SSE catch-up gap; reconciling OMS state", {
            market: event.market,
            afterSeq: event.afterSeq,
            oldestSeq: event.oldestSeq,
            latestSeq: event.latestSeq,
          });
          try {
            await reconcileSseGap(engine, gapDeps);
            metrics.increment("sseGapReconciles");
          } catch (err) {
            log("error", "SSE gap reconcile failed", {
              market: event.market,
              error: err instanceof Error ? err.message : String(err),
            });
            liveBook.notify(event.market);
          }
          return;
        }

        if (
          event.kind === "BBO" ||
          event.kind === "TRADE" ||
          event.kind === "ORDER" ||
          event.kind === "POSITION" ||
          event.kind === "LIQUIDATION" ||
          event.kind === "FUNDING"
        ) {
          liveBook.notify(event.market);
        }

        if (event.kind === "BBO") {
          try {
            await publishBboSnapshot(redis, metrics, {
              market: event.market,
              bestBid: event.bestBid,
              bestAsk: event.bestAsk,
              engineSequence: event.engineSequence,
              timestamp: event.timestamp,
            });
          } catch (err) {
            log("error", "BBO publish failed", {
              error: err instanceof Error ? err.message : String(err),
            });
          }
          return;
        }

        if (event.kind === "TRADE") {
          try {
            await publishTradeTick(redis, metrics, event.trade);
          } catch (err) {
            log("error", "trade publish failed", {
              tradeId: event.trade.tradeId,
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

        if (event.kind === "POSITION") {
          positions.publish(event.position);
          try {
            await publishOrderEvent(redis, toAppPositionEvent(event.position));
            metrics.increment("eventsPublished");
          } catch (err) {
            log("error", "position event publish failed", {
              userId: event.position.userId,
              error: err instanceof Error ? err.message : String(err),
            });
          }
          return;
        }

        if (event.kind === "LIQUIDATION") {
          liquidations.publish(event.liquidation);
          try {
            await publishOrderEvent(
              redis,
              toAppLiquidationEvent(event.liquidation),
            );
            metrics.increment("eventsPublished");
          } catch (err) {
            log("error", "liquidation event publish failed", {
              userId: event.liquidation.userId,
              error: err instanceof Error ? err.message : String(err),
            });
          }
          return;
        }

        if (event.kind === "FUNDING") {
          fundings.publish(event.funding);
          try {
            await publishOrderEvent(redis, toAppFundingEvent(event.funding));
            metrics.increment("eventsPublished");
          } catch (err) {
            log("error", "funding event publish failed", {
              userId: event.funding.userId,
              error: err instanceof Error ? err.message : String(err),
            });
          }
          return;
        }

        log("info", "SSE event received", { kind: event.kind });
      },
      {
        onConnectionChange: (connected) => {
          connectedCount += connected ? 1 : -1;
          if (connectedCount < 0) connectedCount = 0;
          refreshSseMetric();
        },
        onReconnect: () => metrics.increment("sseReconnects"),
        headers: engine.streamHeaders(),
      },
    );
    sse.start();
    sseClients.push(sse);
  }

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
    engines,
    primaryMarket: config.primaryMarket,
    metrics,
    isSseConnected: () => metrics.snapshot().sseConnected === true,
    marketData,
    liveBook,
    positions,
    liquidations,
    fundings,
    internalToken: config.internalToken,
  });
  const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
    log("info", "HTTP server listening", {
      port: info.port,
      engines: config.engines,
    });
  });

  const shutdown = async () => {
    log("info", "shutting down");
    commandsRunning = false;
    for (const sse of sseClients) sse.stop();
    server.close();
    await commandLoop.catch(() => undefined);
    await liveBook.close();
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
