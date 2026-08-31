import {
  COMMAND_STREAM_MAXLEN,
  EVENT_STREAM_MAXLEN,
  ORDERS_COMMANDS_DLQ_STREAM,
  ORDERS_COMMANDS_STREAM,
  ORDERS_EVENTS_DLQ_STREAM,
  ORDERS_EVENTS_STREAM,
} from "@cex/app-contracts";
import { createRedis } from "./redis/streams.js";

type ReplayKind = "commands" | "events";

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  const kind = valueAfter("--stream") as ReplayKind | undefined;
  const limit = Number(valueAfter("--limit") ?? 100);

  if (
    (kind !== "commands" && kind !== "events") ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 10_000
  ) {
    throw new Error(
      "usage: pnpm dlq:replay -- --stream commands|events [--limit 100] [--dry-run]",
    );
  }

  const source =
    kind === "commands"
      ? ORDERS_COMMANDS_DLQ_STREAM
      : ORDERS_EVENTS_DLQ_STREAM;
  const target =
    kind === "commands" ? ORDERS_COMMANDS_STREAM : ORDERS_EVENTS_STREAM;
  const targetMaxLen =
    kind === "commands" ? COMMAND_STREAM_MAXLEN : EVENT_STREAM_MAXLEN;
  const redis = createRedis(
    process.env.REDIS_URL ?? "redis://127.0.0.1:6379",
  );

  try {
    const rows = (await redis.xrange(
      source,
      "-",
      "+",
      "COUNT",
      limit,
    )) as Array<[string, string[]]>;
    let replayed = 0;

    for (const [id, fields] of rows) {
      const encoded = fieldValue(fields, "payload");
      if (!encoded) continue;

      const entry = JSON.parse(encoded) as { rawPayload?: unknown };
      if (typeof entry.rawPayload !== "string") continue;

      if (args.has("--dry-run")) {
        console.log(`[dry-run] ${id} -> ${target}`);
        replayed += 1;
        continue;
      }

      await redis.xadd(
        target,
        "MAXLEN",
        "~",
        targetMaxLen,
        "*",
        "payload",
        entry.rawPayload,
      );
      await redis.xdel(source, id);
      replayed += 1;
    }

    console.log(
      `${args.has("--dry-run") ? "Would replay" : "Replayed"} ${replayed} ${kind} DLQ entr${replayed === 1 ? "y" : "ies"}.`,
    );
  } finally {
    redis.disconnect();
  }
}

function valueAfter(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function fieldValue(fields: string[], key: string): string | null {
  for (let i = 0; i < fields.length; i += 2) {
    if (fields[i] === key) return fields[i + 1] ?? null;
  }
  return null;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
