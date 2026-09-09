import type { Pool } from "pg";
import type { IngesterConfig } from "./config.js";
import { persistEvents } from "./db.js";
import { log } from "./logger.js";
import {
  ackMessage,
  deadLetterMessage,
  ensureGroup,
  readMessages,
  type MarketDataMessage,
} from "./redis.js";
import type { Redis } from "ioredis";

export async function runWorker(
  redis: Redis,
  pool: Pool,
  config: IngesterConfig,
  signal: AbortSignal,
): Promise<void> {
  while (!signal.aborted) {
    try {
      const messages = await readMessages(
        redis,
        config.consumerName,
        config.batchSize,
        config.blockMs,
      );
      await processMessages(redis, pool, messages);
    } catch (error) {
      if (signal.aborted) return;
      const message =
        error instanceof Error ? error.message : String(error);
      log.error("worker error", { error: message });
      if (message.includes("NOGROUP")) {
        try {
          await ensureGroup(redis);
          log.info("recreated md consumer group after NOGROUP");
        } catch (ensureError) {
          log.error("ensureGroup failed", { error: ensureError });
        }
      }
      await sleep(1_000, signal);
    }
  }
}

async function processMessages(
  redis: Redis,
  pool: Pool,
  messages: readonly MarketDataMessage[],
): Promise<void> {
  const valid = [];
  for (const message of messages) {
    if ("event" in message) {
      valid.push(message);
    } else {
      await deadLetterMessage(redis, message);
      await ackMessage(redis, message.id);
      log.warn("market data event dead-lettered", {
        messageId: message.id,
        reason: message.reason,
      });
    }
  }

  if (valid.length === 0) return;
  await persistEvents(
    pool,
    valid.map((message) => message.event),
  );
  log.debug("market data batch persisted", { count: valid.length });
  for (const message of valid) {
    await ackMessage(redis, message.id);
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
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
