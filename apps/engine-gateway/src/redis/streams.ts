import Redis from "ioredis";
import {
  COMMAND_STREAM_MAXLEN,
  DLQ_STREAM_MAXLEN,
  EVENT_STREAM_MAXLEN,
  ORDERS_COMMANDS_STREAM,
  ORDERS_COMMANDS_DLQ_STREAM,
  ORDERS_EVENTS_STREAM,
  XPG_COMMANDS_GROUP,
  type AppCommand,
  type AppOrderEvent,
  isAppCommand,
} from "@cex/app-contracts";
import { streamIdTimeMs } from "../commands/simPipe.js";

export function createRedis(url: string): Redis {
  return new Redis(url, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    retryStrategy: (attempt) =>
      attempt > 5 ? null : Math.min(attempt * 200, 2_000),
  });
}

// Create consumer group on orders:commands (idempotent if it already exists). 
export async function ensureCommandGroup(redis: Redis): Promise<void> {
  try {
    await redis.xgroup(
      "CREATE",
      ORDERS_COMMANDS_STREAM,
      XPG_COMMANDS_GROUP,
      "0",
      "MKSTREAM",
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!message.includes("BUSYGROUP")) throw err;
  }
}

export type CommandMessage = {
  id: string;
  command: AppCommand;
};

export type DeadLetterMessage = {
  id: string;
  rawPayload: string | null;
  reason: string;
};

export type CommandReadResult = CommandMessage | DeadLetterMessage;

// Blocking read of new commands for this consumer. 
export async function readCommands(
  redis: Redis,
  consumerName: string,
  count = 8,
  blockMs = 5_000,
): Promise<CommandReadResult[]> {
  const result = await redis.xreadgroup(
    "GROUP",
    XPG_COMMANDS_GROUP,
    consumerName,
    "COUNT",
    count,
    "BLOCK",
    blockMs,
    "STREAMS",
    ORDERS_COMMANDS_STREAM,
    ">",
  );

  if (!result) return [];

  const streams = result as Array<[string, Array<[string, string[]]>]>;
  return parseMessages(streams[0]?.[1] ?? []);
}

// Reclaim commands left pending by a crashed gateway consumer. A message must be idle for minIdleMs before another consumer takes it.
 
export async function recoverPendingCommands(
  redis: Redis,
  consumerName: string,
  minIdleMs = 30_000,
  count = 8,
): Promise<CommandReadResult[]> {
  const result = await redis.xpending(
    ORDERS_COMMANDS_STREAM,
    XPG_COMMANDS_GROUP,
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
    ORDERS_COMMANDS_STREAM,
    XPG_COMMANDS_GROUP,
    consumerName,
    minIdleMs,
    ...ids,
  );
  return parseMessages(claimed as Array<[string, string[]]>);
}

export async function ackCommand(redis: Redis, id: string): Promise<void> {
  await redis.xack(ORDERS_COMMANDS_STREAM, XPG_COMMANDS_GROUP, id);
}

export async function ackCommands(redis: Redis, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  if (ids.length === 1) {
    await ackCommand(redis, ids[0]!);
    return;
  }
  const pipe = redis.pipeline();
  for (const id of ids) {
    pipe.xack(ORDERS_COMMANDS_STREAM, XPG_COMMANDS_GROUP, id);
  }
  await pipe.exec();
}

/**
 * How long the oldest command still waiting for this group has been sitting.
 * Redis 7 `lag` is null on this group (it was created before entries-read
 * existed), so health checks that trust `lag` report a jammed pipe as healthy.
 */
let backlogAgeCache = { at: 0, ageMs: 0 };

export function forgetCommandBacklogCache(): void {
  backlogAgeCache = { at: 0, ageMs: 0 };
}

export async function unreadCommandAgeMs(redis: Redis): Promise<number> {
  const now = Date.now();
  if (now - backlogAgeCache.at < 200) return backlogAgeCache.ageMs;

  const ageMs = await readUnreadCommandAgeMs(redis, now);
  backlogAgeCache = { at: now, ageMs };
  return ageMs;
}

async function readUnreadCommandAgeMs(
  redis: Redis,
  now: number,
): Promise<number> {
  const raw = await redis.xinfo("GROUPS", ORDERS_COMMANDS_STREAM);
  const lastId = lastDeliveredId(raw, XPG_COMMANDS_GROUP);
  const start = lastId ? `(${lastId}` : "-";
  const next = (await redis.xrange(
    ORDERS_COMMANDS_STREAM,
    start,
    "+",
    "COUNT",
    1,
  )) as Array<[string, string[]]> | null;
  const id = next?.[0]?.[0];
  if (!id) return 0;
  const enqueuedAt = streamIdTimeMs(id);
  if (enqueuedAt == null) return 0;
  return Math.max(0, now - enqueuedAt);
}

function lastDeliveredId(raw: unknown, group: string): string | null {
  if (!Array.isArray(raw)) return null;
  for (const entry of raw) {
    const row = xinfoRecord(entry);
    if (!row || row.name !== group) continue;
    const id = row["last-delivered-id"];
    if (!id || id === "0-0") return null;
    return id;
  }
  return null;
}

function xinfoRecord(entry: unknown): Record<string, string> | null {
  if (Array.isArray(entry)) {
    const row: Record<string, string> = {};
    for (let i = 0; i + 1 < entry.length; i += 2) {
      row[String(entry[i])] = String(entry[i + 1]);
    }
    return row.name ? row : null;
  }
  if (entry && typeof entry === "object") {
    const row: Record<string, string> = {};
    for (const [key, value] of Object.entries(entry as Record<string, unknown>)) {
      if (value != null) row[key] = String(value);
    }
    return row.name ? row : null;
  }
  return null;
}

/** Drop leftover consumers from old gateway processes. Pending work is left alone. */
export async function dropIdleCommandConsumers(
  redis: Redis,
  keepName: string,
  minIdleMs = 60_000,
): Promise<number> {
  const raw = await redis.xinfo(
    "CONSUMERS",
    ORDERS_COMMANDS_STREAM,
    XPG_COMMANDS_GROUP,
  );
  if (!Array.isArray(raw)) return 0;
  let dropped = 0;
  for (const entry of raw) {
    const row = xinfoRecord(entry);
    if (!row?.name || row.name === keepName) continue;
    const pending = Number(row.pending ?? 0);
    const idle = Number(row.idle ?? 0);
    if (pending > 0 || idle < minIdleMs) continue;
    await redis.xgroup(
      "DELCONSUMER",
      ORDERS_COMMANDS_STREAM,
      XPG_COMMANDS_GROUP,
      row.name,
    );
    dropped += 1;
  }
  return dropped;
}

export async function deadLetterCommand(
  redis: Redis,
  message: DeadLetterMessage,
): Promise<string> {
  const id = await redis.xadd(
    ORDERS_COMMANDS_DLQ_STREAM,
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
  if (!id) throw new Error("xadd orders:commands:dlq returned null");
  return id;
}

// Publish an app-layer order event for OMS (and tooling) to consume. 
export async function publishOrderEvent(
  redis: Redis,
  event: AppOrderEvent,
): Promise<string> {
  const id = await redis.xadd(
    ORDERS_EVENTS_STREAM,
    "MAXLEN",
    "~",
    EVENT_STREAM_MAXLEN,
    "*",
    "payload",
    JSON.stringify(event),
  );
  if (!id) throw new Error("xadd orders:events returned null");
  return id;
}

// Dev helper push a command onto the mailbox (until OMS exists). 
export async function injectCommand(
  redis: Redis,
  command: AppCommand,
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
  if (!id) throw new Error("xadd orders:commands returned null");
  return id;
}

function fieldValue(fields: string[], key: string): string | null {
  for (let i = 0; i < fields.length; i += 2) {
    if (fields[i] === key) return fields[i + 1] ?? null;
  }
  return null;
}

function parseMessages(
  messages: Array<[string, string[]]>,
): CommandReadResult[] {
  return messages.map(([id, fields]) => {
    const rawPayload = fieldValue(fields, "payload");
    if (!rawPayload) {
      return {
        id,
        rawPayload,
        reason: "MISSING_PAYLOAD",
      };
    }

    try {
      const value: unknown = JSON.parse(rawPayload);
      if (!isAppCommand(value)) {
        return {
          id,
          rawPayload,
          reason: "INVALID_COMMAND",
        };
      }
      return { id, command: value };
    } catch {
      return {
        id,
        rawPayload,
        reason: "INVALID_JSON",
      };
    }
  });
}
