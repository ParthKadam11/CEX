import type { Pool } from "pg";
import type { MarketDataWriterConfig } from "./config.js";
import { persistEvents } from "./db.js";
import {
  ackMessage,
  deadLetterMessage,
  readMessages,
  type MarketDataMessage,
} from "./redis.js";
import type { Redis } from "ioredis";

export async function runWorker(
  redis: Redis,
  pool: Pool,
  config: MarketDataWriterConfig,
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
      console.error(
        "[market-data-writer] worker error",
        error instanceof Error ? error.message : String(error),
      );
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
    }
  }

  if (valid.length === 0) return;
  await persistEvents(
    pool,
    valid.map((message) => message.event),
  );
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
