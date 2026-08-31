import { Redis } from "ioredis";
import {
  MARKET_DATA_CONSUMER_GROUP,
  MARKET_DATA_DLQ_MAXLEN,
  MARKET_DATA_DLQ_STREAM,
  MARKET_DATA_STREAM,
} from "@cex/app-contracts";
import type { MarketDataEvent } from "@cex/app-contracts";
import { isMarketDataEvent } from "@cex/app-contracts";

export type MarketDataMessage =
  | { id: string; event: MarketDataEvent }
  | { id: string; rawPayload: string | null; reason: string };

export function createRedis(url: string): Redis {
  return new Redis(url, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    retryStrategy: (attempt: number) =>
      attempt > 5 ? null : Math.min(attempt * 200, 2_000),
  });
}

export async function ensureGroup(redis: Redis): Promise<void> {
  try {
    await redis.xgroup(
      "CREATE",
      MARKET_DATA_STREAM,
      MARKET_DATA_CONSUMER_GROUP,
      "0",
      "MKSTREAM",
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("BUSYGROUP")) throw error;
  }
}

export async function readMessages(
  redis: Redis,
  consumerName: string,
  count: number,
  blockMs: number,
): Promise<MarketDataMessage[]> {
  const pending = await recoverPending(redis, consumerName, count);
  const result = await redis.xreadgroup(
    "GROUP",
    MARKET_DATA_CONSUMER_GROUP,
    consumerName,
    "COUNT",
    count,
    "BLOCK",
    blockMs,
    "STREAMS",
    MARKET_DATA_STREAM,
    ">",
  );
  const fresh = result
    ? parseMessages(
        (result as Array<[string, Array<[string, string[]]>]>)[0]?.[1] ?? [],
      )
    : [];
  return [...pending, ...fresh];
}

export async function ackMessage(redis: Redis, id: string): Promise<void> {
  await redis.xack(MARKET_DATA_STREAM, MARKET_DATA_CONSUMER_GROUP, id);
}

export async function deadLetterMessage(
  redis: Redis,
  message: Extract<MarketDataMessage, { rawPayload: string | null }>,
): Promise<void> {
  await redis.xadd(
    MARKET_DATA_DLQ_STREAM,
    "MAXLEN",
    "~",
    MARKET_DATA_DLQ_MAXLEN,
    "*",
    "payload",
    JSON.stringify({
      originalMessageId: message.id,
      rawPayload: message.rawPayload,
      reason: message.reason,
      timestamp: Date.now(),
    }),
  );
}

async function recoverPending(
  redis: Redis,
  consumerName: string,
  count: number,
): Promise<MarketDataMessage[]> {
  const result = await redis.xpending(
    MARKET_DATA_STREAM,
    MARKET_DATA_CONSUMER_GROUP,
    "-",
    "+",
    count,
  );
  const pending = result as Array<[string, string, number, number]>;
  const ids = pending
    .filter(([, , idleMs]) => idleMs >= 30_000)
    .map(([id]) => id);
  if (ids.length === 0) return [];

  const claimed = await redis.xclaim(
    MARKET_DATA_STREAM,
    MARKET_DATA_CONSUMER_GROUP,
    consumerName,
    30_000,
    ...ids,
  );
  return parseMessages(claimed as Array<[string, string[]]>);
}

function parseMessages(
  messages: Array<[string, string[]]>,
): MarketDataMessage[] {
  return messages.map(([id, fields]) => {
    const rawPayload = fieldValue(fields, "payload");
    if (!rawPayload) return { id, rawPayload, reason: "MISSING_PAYLOAD" };

    try {
      const value: unknown = JSON.parse(rawPayload);
      return isMarketDataEvent(value)
        ? { id, event: value }
        : { id, rawPayload, reason: "INVALID_MARKET_DATA_EVENT" };
    } catch {
      return { id, rawPayload, reason: "INVALID_JSON" };
    }
  });
}

function fieldValue(fields: string[], key: string): string | null {
  for (let i = 0; i < fields.length; i += 2) {
    if (fields[i] === key) return fields[i + 1] ?? null;
  }
  return null;
}
