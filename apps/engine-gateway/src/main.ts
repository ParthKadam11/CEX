import { serve } from "@hono/node-server";
import { loadConfig } from "./config.js";
import { EngineClient } from "./engine/client.js";
import { createGatewayApp } from "./http/server.js";
import { createRedis, ensureCommandGroup } from "./redis/streams.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const redis = createRedis(config.redisUrl);
  const engine = new EngineClient(config.exchangeUrl, config.market);

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

  const app = createGatewayApp();
  const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
    console.log(
      `engine-gateway listening on http://localhost:${info.port} exchange=${config.exchangeUrl}`,
    );
  });

  const shutdown = () => {
    console.log("[boot] shutting down");
    server.close();
    redis.disconnect();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
