import { serve } from "@hono/node-server";
import { loadConfig } from "./config.js";
import { createOmsApp } from "./http/server.js";
import { OrderRepository } from "./orders/repository.js";
import { OrderService } from "./orders/service.js";
import { createRedis } from "./redis/client.js";
import {
  ackEvent,
  deadLetterEvent,
  ensureEventGroup,
  readEvents,
  recoverPendingEvents,
} from "./redis/events.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const redis = createRedis(config.redisUrl);
  const repository = new OrderRepository();
  const orderService = new OrderService(repository, redis);

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

  const app = createOmsApp(orderService);
  const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
    console.log(`oms listening on http://localhost:${info.port}`);
  });

  const shutdown = async () => {
    eventsRunning = false;
    server.close();
    await eventLoop.catch(() => undefined);
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
