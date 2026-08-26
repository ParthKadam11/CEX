import Redis from "ioredis";
import {
  ORDERS_COMMANDS_STREAM,
  ORDERS_EVENTS_STREAM,
  XPG_COMMANDS_GROUP,
  type AppCommand,
  type AppOrderEvent,
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

// Blocking read of new commands for this consumer. 
export async function readCommands(
  redis: Redis,
  consumerName: string,
  count = 8,
  blockMs = 5_000,
): Promise<CommandMessage[]> {
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

  const out: CommandMessage[] = [];
  const streams = result as Array<[string, Array<[string, string[]]>]>;
  for (const [, messages] of streams) {
    for (const [id, fields] of messages) {
      const payload = fieldValue(fields, "payload");
      if (!payload) {
        console.error("[streams] missing payload", id);
        continue;
      }
      try {
        out.push({ id, command: JSON.parse(payload) as AppCommand });
      } catch (err) {
        console.error(
          "[streams] bad payload",
          id,
          err instanceof Error ? err.message : err,
        );
      }
    }
  }
  return out;
}

export async function ackCommand(redis: Redis, id: string): Promise<void> {
  await redis.xack(ORDERS_COMMANDS_STREAM, XPG_COMMANDS_GROUP, id);
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
