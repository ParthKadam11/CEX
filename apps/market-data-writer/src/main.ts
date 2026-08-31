import { serve } from "@hono/node-server";
import { createPool, runMigrations } from "./db.js";
import { loadConfig } from "./config.js";
import { createRedis, ensureGroup } from "./redis.js";
import { runWorker } from "./worker.js";
import { createHistoryApp } from "./http.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const redis = createRedis(config.redisUrl);
  const pool = createPool(config.timescaleUrl);
  const abortController = new AbortController();
  const shutdown = () => abortController.abort();
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  let server: ReturnType<typeof serve> | undefined;

  try {
    await runMigrations(pool);
    await ensureGroup(redis);
    server = serve(
      {
        fetch: createHistoryApp(pool, {
          internalToken: config.internalToken,
        }).fetch,
        port: config.port,
      },
      (info) => {
        console.log(
          `[market-data-writer] ready on http://localhost:${info.port}`,
        );
      },
    );
    await runWorker(redis, pool, config, abortController.signal);
  } finally {
    abortController.abort();
    server?.close();
    redis.disconnect();
    await pool.end();
    process.off("SIGINT", shutdown);
    process.off("SIGTERM", shutdown);
  }
}

main().catch((error) => {
  console.error(
    "[market-data-writer] fatal error",
    error instanceof Error ? error.message : String(error),
  );
  process.exitCode = 1;
});
