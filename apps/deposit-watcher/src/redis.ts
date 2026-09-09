import { Redis } from "ioredis";
import {
  COMMAND_STREAM_MAXLEN,
  EVENT_STREAM_MAXLEN,
  ORDERS_COMMANDS_STREAM,
  ORDERS_EVENTS_STREAM,
  type CreditCommand,
  type AppOrderEvent,
} from "@cex/app-contracts";

export function createRedis(url: string): Redis {
  return new Redis(url, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    retryStrategy: (attempt) =>
      attempt > 5 ? null : Math.min(attempt * 200, 2_000),
  });
}

export async function publishCredit(
  redis: Redis,
  command: CreditCommand,
): Promise<string> {
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

/**
 * Block-read orders:events until CREDIT_OK / CREDIT_FAILED for commandId,
 * or timeout. Uses a private cursor from `$` then polls briefly for catch-up.
 */
export async function waitForCreditResult(
  redis: Redis,
  commandId: string,
  timeoutMs = 20_000,
  afterId = "$",
): Promise<{ ok: boolean; reason?: string }> {
  const deadline = Date.now() + timeoutMs;
  let cursor = afterId;

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
      if (event.type === "CREDIT_OK") return { ok: true };
      if (event.type === "CREDIT_FAILED") {
        return { ok: false, reason: event.reason ?? "CREDIT_FAILED" };
      }
    }
  }

  // Fallback: scan recent events in case we started after publish.
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
      if (event.type === "CREDIT_OK") return { ok: true };
      if (event.type === "CREDIT_FAILED") {
        return { ok: false, reason: event.reason ?? "CREDIT_FAILED" };
      }
    } catch {
      // ignore
    }
  }

  return { ok: false, reason: "CREDIT_TIMEOUT" };
}

function fieldValue(fields: string[], key: string): string | null {
  for (let i = 0; i + 1 < fields.length; i += 2) {
    if (fields[i] === key) return fields[i + 1] ?? null;
  }
  return null;
}

export { ORDERS_EVENTS_STREAM, EVENT_STREAM_MAXLEN };
