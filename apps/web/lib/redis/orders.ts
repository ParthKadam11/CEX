import { Redis } from "ioredis";
import {
  COMMAND_STREAM_MAXLEN,
  ORDERS_COMMANDS_STREAM,
  ORDERS_EVENTS_STREAM,
  type AppCommand,
  type AppOrderEvent,
} from "@cex/app-contracts";

export function createOrdersRedis(): Redis {
  const url = process.env.REDIS_URL?.trim() || "redis://127.0.0.1:6379";
  return new Redis(url, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: true,
    retryStrategy: (attempt) =>
      attempt > 5 ? null : Math.min(attempt * 200, 2_000),
  });
}

export async function publishCommand(
  redis: Redis,
  command: AppCommand,
): Promise<string> {
  if (redis.status !== "ready") await redis.connect();
  const id = await redis.xadd(
    ORDERS_COMMANDS_STREAM,
    "MAXLEN",
    "~",
    COMMAND_STREAM_MAXLEN,
    "*",
    "payload",
    JSON.stringify(command),
  );
  if (!id) throw new Error("Redis did not return a command stream ID");
  return id;
}

export async function waitForCommandResult(
  redis: Redis,
  commandId: string,
  okType: AppOrderEvent["type"],
  failType: AppOrderEvent["type"],
  timeoutMs = 20_000,
): Promise<{ ok: boolean; reason?: string }> {
  if (redis.status !== "ready") await redis.connect();
  const deadline = Date.now() + timeoutMs;
  let cursor = "$";

  while (Date.now() < deadline) {
    const blockMs = Math.min(2_000, Math.max(200, deadline - Date.now()));
    const result = await redis.xread(
      "COUNT",
      32,
      "BLOCK",
      blockMs,
      "STREAMS",
      ORDERS_EVENTS_STREAM,
      cursor,
    );
    if (!result) continue;

    const streams = result as Array<[string, Array<[string, string[]]>]>;
    const messages = streams[0]?.[1] ?? [];
    for (const [id, fields] of messages) {
      cursor = id;
      const payload = fieldValue(fields, "payload");
      if (!payload) continue;
      let event: AppOrderEvent;
      try {
        event = JSON.parse(payload) as AppOrderEvent;
      } catch {
        continue;
      }
      if (event.commandId !== commandId) continue;
      if (event.type === okType) return { ok: true };
      if (event.type === failType) {
        return { ok: false, reason: event.reason ?? failType };
      }
    }
  }

  const recent = await redis.xrevrange(
    ORDERS_EVENTS_STREAM,
    "+",
    "-",
    "COUNT",
    200,
  );
  for (const [, fields] of recent as Array<[string, string[]]>) {
    const payload = fieldValue(fields, "payload");
    if (!payload) continue;
    try {
      const event = JSON.parse(payload) as AppOrderEvent;
      if (event.commandId !== commandId) continue;
      if (event.type === okType) return { ok: true };
      if (event.type === failType) {
        return { ok: false, reason: event.reason ?? failType };
      }
    } catch {
      // ignore
    }
  }

  return { ok: false, reason: "COMMAND_TIMEOUT" };
}

function fieldValue(fields: string[], key: string): string | null {
  for (let i = 0; i + 1 < fields.length; i += 2) {
    if (fields[i] === key) return fields[i + 1] ?? null;
  }
  return null;
}
