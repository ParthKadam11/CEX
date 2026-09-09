import { existsSync } from "node:fs";
import path from "node:path";
import { serve } from "@hono/node-server";
import { config as loadDotenv } from "dotenv";
import { loadConfig } from "./config.js";
import { log } from "./logger.js";
import { createRedis } from "./redis/client.js";
import {
  ackEvent,
  deadLetterEvent,
  ensureEventGroup,
  readEvents,
  recoverPendingEvents,
} from "./redis/events.js";

async function main(): Promise<void> {
  loadEnvironment();
  const config = loadConfig();
  if (!config.databaseUrl) {
    throw new Error("DATABASE_URL is required to start OMS");
  }

  const { createOmsApp } = await import("./http/server.js");
  const { OrderRepository } = await import("./orders/repository.js");
  const { OrderService } = await import("./orders/service.js");
  const redis = createRedis(config.redisUrl);
  const repository = new OrderRepository();
  const orderService = new OrderService(repository, redis);

  try {
    await repository.health();
  } catch (error) {
    redis.disconnect();
    throw new Error(
      `OMS database is not reachable: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  await ensureEventGroup(redis);
  log.info("event consumer group ready");

  let eventsRunning = true;
  const eventLoop = (async () => {
    while (eventsRunning) {
      try {
        const pending = await recoverPendingEvents(
          redis,
          config.consumerName,
        );
        const events = [
          ...pending,
          ...(await readEvents(redis, config.consumerName)),
        ];

        for (const message of events) {
          if ("event" in message) {
            const event = message.event;
            await repository.applyEvent(event);
            log.debug("order event applied", {
              requestId: event.requestId,
              eventId: event.eventId,
              commandId: event.commandId,
              orderId: event.orderId,
              market: event.market,
              userId: event.userId,
              type: event.type,
            });
          } else {
            await deadLetterEvent(redis, message);
            log.warn("order event dead-lettered", {
              reason: message.reason,
              messageId: message.id,
            });
          }
          await ackEvent(redis, message.id);
        }
      } catch (error) {
        if (!eventsRunning) return;
        const message =
          error instanceof Error ? error.message : String(error);
        log.error("event loop error", { error: message });
        if (message.includes("NOGROUP")) {
          try {
            await ensureEventGroup(redis);
            log.info("recreated event consumer group after NOGROUP");
          } catch (ensureError) {
            log.error("ensureEventGroup failed", { error: ensureError });
          }
        }
        await sleep(1000);
      }
    }
  })();

  let outboxRunning = true;
  const outboxLoop = (async () => {
    const { isOutboxCommand } = await import("./orders/outbox.js");
    while (outboxRunning) {
      try {
        const entries = await orderService.relayOutbox();
        for (const entry of entries) {
          if (!isOutboxCommand(entry.payload)) continue;
          if (entry.payload.type === "CREDIT") continue;
          try {
            await orderService.publishOutboxEntry(entry.payload);
          } catch (error) {
            log.error("outbox publish failed", {
              requestId:
                "requestId" in entry.payload
                  ? entry.payload.requestId
                  : undefined,
              commandId: entry.payload.commandId,
              orderId:
                "orderId" in entry.payload
                  ? entry.payload.orderId
                  : undefined,
              market:
                "market" in entry.payload ? entry.payload.market : undefined,
              error,
            });
          }
        }
        await sleep(entries.length === 0 ? 2_000 : 250);
      } catch (error) {
        if (!outboxRunning) return;
        log.error("outbox loop error", { error });
        await sleep(2_000);
      }
    }
  })();

  const app = createOmsApp(orderService, {
    internalToken: config.internalToken,
  });
  const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
    log.info("HTTP server listening", { port: info.port });
  });

  const shutdown = async () => {
    log.info("shutting down");
    eventsRunning = false;
    outboxRunning = false;
    server.close();
    await Promise.all([
      eventLoop.catch(() => undefined),
      outboxLoop.catch(() => undefined),
    ]);
    redis.disconnect();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  log.error("fatal startup error", { error });
  process.exit(1);
});

function loadEnvironment(): void {
  const paths = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "../../packages/db/.env"),
    path.resolve(process.cwd(), "packages/db/.env"),
  ];
  for (const envPath of paths) {
    if (existsSync(envPath)) loadDotenv({ path: envPath });
  }
}
