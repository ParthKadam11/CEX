import type Redis from "ioredis";
import {
  DLQ_STREAM_MAXLEN,
  OMS_EVENTS_GROUP,
  ORDERS_EVENTS_DLQ_STREAM,
  ORDERS_EVENTS_STREAM,
  type AppOrderEvent,
} from "@cex/app-contracts";
import { isIdentifier, isTimestamp } from "@cex/exchange-types";

export type EventMessage = {
  id: string;
  event: AppOrderEvent;
};

export type InvalidEventMessage = {
  id: string;
  rawPayload: string | null;
  reason: string;
};

export type EventReadResult = EventMessage | InvalidEventMessage;

export async function ensureEventGroup(redis: Redis): Promise<void> {
  try {
    await redis.xgroup(
      "CREATE",
      ORDERS_EVENTS_STREAM,
      OMS_EVENTS_GROUP,
      "0",
      "MKSTREAM",
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("BUSYGROUP")) throw error;
  }
}

export async function readEvents(
  redis: Redis,
  consumerName: string,
  count = 8,
  blockMs = 5_000,
): Promise<EventReadResult[]> {
  const result = await redis.xreadgroup(
    "GROUP",
    OMS_EVENTS_GROUP,
    consumerName,
    "COUNT",
    count,
    "BLOCK",
    blockMs,
    "STREAMS",
    ORDERS_EVENTS_STREAM,
    ">",
  );
  if (!result) return [];

  const streams = result as Array<[string, Array<[string, string[]]>]>;
  return parseMessages(streams[0]?.[1] ?? []);
}

export async function recoverPendingEvents(
  redis: Redis,
  consumerName: string,
  minIdleMs = 30_000,
  count = 8,
): Promise<EventReadResult[]> {
  const result = await redis.xpending(
    ORDERS_EVENTS_STREAM,
    OMS_EVENTS_GROUP,
    "-",
    "+",
    count,
  );
  const pending = result as Array<[string, string, number, number]>;
  const ids = pending
    .filter(([, , idleMs]) => idleMs >= minIdleMs)
    .map(([id]) => id);
  if (ids.length === 0) return [];

  const claimed = await redis.xclaim(
    ORDERS_EVENTS_STREAM,
    OMS_EVENTS_GROUP,
    consumerName,
    minIdleMs,
    ...ids,
  );
  return parseMessages(claimed as Array<[string, string[]]>);
}

export async function ackEvent(redis: Redis, id: string): Promise<void> {
  await redis.xack(ORDERS_EVENTS_STREAM, OMS_EVENTS_GROUP, id);
}

export async function deadLetterEvent(
  redis: Redis,
  message: InvalidEventMessage,
): Promise<string> {
  const id = await redis.xadd(
    ORDERS_EVENTS_DLQ_STREAM,
    "MAXLEN",
    "~",
    DLQ_STREAM_MAXLEN,
    "*",
    "payload",
    JSON.stringify({
      originalMessageId: message.id,
      rawPayload: message.rawPayload,
      reason: message.reason,
      timestamp: Date.now(),
    }),
  );
  if (!id) throw new Error("xadd orders:events:dlq returned null");
  return id;
}

function parseMessages(
  messages: Array<[string, string[]]>,
): EventReadResult[] {
  return messages.map(([id, fields]) => {
    const rawPayload = fieldValue(fields, "payload");
    if (!rawPayload) {
      return { id, rawPayload, reason: "MISSING_PAYLOAD" };
    }

    try {
      const value: unknown = JSON.parse(rawPayload);
      if (!isAppOrderEvent(value)) {
        return { id, rawPayload, reason: "INVALID_EVENT" };
      }
      return { id, event: value };
    } catch {
      return { id, rawPayload, reason: "INVALID_JSON" };
    }
  });
}

function isAppOrderEvent(value: unknown): value is AppOrderEvent {
  if (!isRecord(value)) return false;

  const eventTypes = [
    "ACCEPTED",
    "REJECTED",
    "RESTING",
    "FILL",
    "CANCELLED",
    "CREDIT_OK",
    "CREDIT_FAILED",
    "COMMAND_FAILED",
  ];

  return (
    isIdentifier(value.eventId) &&
    typeof value.type === "string" &&
    eventTypes.includes(value.type) &&
    isIdentifier(value.userId) &&
    value.market === "SOL-USD" &&
    isTimestamp(value.timestamp) &&
    (value.commandId === undefined || isIdentifier(value.commandId)) &&
    (value.orderId === undefined || isIdentifier(value.orderId)) &&
    (value.clientOrderId === undefined || isIdentifier(value.clientOrderId))
  );
}

function fieldValue(fields: string[], key: string): string | null {
  for (let i = 0; i < fields.length; i += 2) {
    if (fields[i] === key) return fields[i + 1] ?? null;
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
