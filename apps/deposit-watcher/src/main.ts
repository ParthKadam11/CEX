import { serve } from "@hono/node-server";
import { createLogger } from "@cex/logger";
import { assertDevnetOnly } from "@cex/solana";
import { loadConfig, loadEnvironment } from "./config.js";
import { createWatcherApp } from "./http.js";
import { createRedis } from "./redis.js";
import { runScanCycle } from "./worker.js";

const log = createLogger("deposit-watcher");

async function main(): Promise<void> {
  loadEnvironment();
  assertDevnetOnly();
  const config = loadConfig();
  const redis = createRedis(config.redisUrl);
  const abort = new AbortController();

  const shutdown = () => abort.abort();
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  const server = serve(
    {
      fetch: createWatcherApp(redis).fetch,
      port: config.port,
    },
    (info) => {
      log.info("HTTP server listening", { port: info.port });
    },
  );

  log.info("deposit watcher started", {
    pollIntervalMs: config.pollIntervalMs,
    commitment: config.confirmations,
    minLots: config.minLots,
  });

  try {
    while (!abort.signal.aborted) {
      try {
        const result = await runScanCycle(redis, config);
        if (result.seen > 0 || result.credited > 0) {
          log.info("scan cycle", result);
        }
      } catch (error) {
        log.error("scan cycle failed", { error });
      }
      await sleep(config.pollIntervalMs, abort.signal);
    }
  } finally {
    log.info("shutting down");
    server.close();
    redis.disconnect();
    process.off("SIGINT", shutdown);
    process.off("SIGTERM", shutdown);
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

main().catch((error) => {
  log.error("fatal startup error", { error });
  process.exitCode = 1;
});
