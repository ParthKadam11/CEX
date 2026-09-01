import { existsSync } from "node:fs";
import path from "node:path";
import { serve } from "@hono/node-server";
import { config as loadDotenv } from "dotenv";
import { loadConfig } from "./config.js";
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
  console.log("[oms] event consumer group ready");

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
            await repository.applyEvent(message.event);
          } else {
            await deadLetterEvent(redis, message);
          }
          await ackEvent(redis, message.id);
        }
      } catch (error) {
        if (!eventsRunning) return;
        console.error(
          "[oms] event loop error:",
          error instanceof Error ? error.message : error,
        );
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
            console.error(
              "[oms] outbox publish failed:",
              error instanceof Error ? error.message : error,
            );
          }
        }
        await sleep(entries.length === 0 ? 2_000 : 250);
      } catch (error) {
        if (!outboxRunning) return;
        console.error(
          "[oms] outbox loop error:",
          error instanceof Error ? error.message : error,
        );
        await sleep(2_000);
      }
    }
  })();

  const app = createOmsApp(orderService, {
    internalToken: config.internalToken,
  });
  const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
    console.log(`oms listening on http://localhost:${info.port}`);
  });

  const shutdown = async () => {
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
  console.error(error);
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
