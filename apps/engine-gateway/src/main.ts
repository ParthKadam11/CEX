import { serve } from "@hono/node-server";
import { loadConfig } from "./config.js";
import { CommandDedupe } from "./dedupe.js";
import { CommandHandler } from "./commands/handler.js";
import { EngineClient } from "./engine/client.js";
import { EngineSseClient } from "./engine/sse.js";
import { createGatewayApp } from "./http/server.js";
import {
  ackCommand,
  createRedis,
  ensureCommandGroup,
  readCommands,
} from "./redis/streams.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const redis = createRedis(config.redisUrl);
  const engine = new EngineClient(config.exchangeUrl, config.market);
  const dedupe = new CommandDedupe();
  const handler = new CommandHandler(engine, redis, dedupe);

  await ensureCommandGroup(redis);
  console.log("[boot] redis command group ready");

  try {
    const health = await engine.health();
    console.log("[boot] exchange ok", health);
  } catch (err) {
    console.warn(
      "[boot] exchange not reachable yet:",
      err instanceof Error ? err.message : err,
    );
  }

  const sse = new EngineSseClient(engine.streamUrl(), (event) => {
    console.log("[sse] event", event.kind);
  });
  sse.start();

  let commandsRunning = true;
  const commandLoop = (async () => {
    while (commandsRunning) {
      try {
        const batch = await readCommands(redis, config.consumerName);
        for (const msg of batch) {
          await handler.handle(msg.command);
          await ackCommand(redis, msg.id);
        }
      } catch (err) {
        if (!commandsRunning) return;
        console.error(
          "[commands] loop error:",
          err instanceof Error ? err.message : err,
        );
        await sleep(1000);
      }
    }
  })();

  const app = createGatewayApp();
  const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
    console.log(
      `engine-gateway listening on http://localhost:${info.port} exchange=${config.exchangeUrl}`,
    );
  });

  const shutdown = async () => {
    console.log("[boot] shutting down");
    commandsRunning = false;
    sse.stop();
    server.close();
    await commandLoop.catch(() => undefined);
    redis.disconnect();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
