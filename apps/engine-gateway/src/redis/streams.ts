import Redis from "ioredis";
import {
  ORDERS_COMMANDS_STREAM,
  ORDERS_COMMANDS_DLQ_STREAM,
  ORDERS_EVENTS_STREAM,
  XPG_COMMANDS_GROUP,
  type AppCommand,
  type AppOrderEvent,
  isAppCommand,
} from "@cex/app-contracts";

export function createRedis(url: string): Redis {
  return new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
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

export async function deadLetterCommand(
  redis: Redis,
  message: DeadLetterMessage,
): Promise<string> {
  const id = await redis.xadd(
    ORDERS_COMMANDS_DLQ_STREAM,
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
