import type Redis from "ioredis";
import {
  ORDERS_COMMANDS_STREAM,
  type AppCommand,
  type CancelCommand,
  type CreditCommand,
  type PlaceCommand,
} from "@cex/app-contracts";

export async function publishPlaceCommand(
  redis: Redis,
  command: PlaceCommand,
): Promise<string> {
  return publishCommand(redis, command);
}

export async function publishCancelCommand(
  redis: Redis,
  command: CancelCommand,
): Promise<string> {
  return publishCommand(redis, command);
}

export async function publishCreditCommand(
  redis: Redis,
  command: CreditCommand,
): Promise<string> {
  return publishCommand(redis, command);
}

async function publishCommand(
  redis: Redis,
  command: AppCommand,
): Promise<string> {
  const id = await redis.xadd(
    ORDERS_COMMANDS_STREAM,
    "*",
    "payload",
    JSON.stringify(command),
  );
  if (!id) throw new Error("Redis did not return a command stream ID");
  return id;
}
