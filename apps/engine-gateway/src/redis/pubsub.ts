import type Redis from "ioredis";
import {
  mdBboChannel,
  mdTradeChannel,
  type BboMessage,
  type TradeTickMessage,
} from "@cex/app-contracts";

// Publishes live market data. Redis pub/sub is intentionally ephemeral:  subscribers only receive messages while they are connected.

export async function publishBbo(
  redis: Redis,
  message: BboMessage,
): Promise<number> {
  return redis.publish(
    mdBboChannel(message.market),
    JSON.stringify(message),
  );
}

export async function publishTrade(
  redis: Redis,
  message: TradeTickMessage,
): Promise<number> {
  return redis.publish(
    mdTradeChannel(message.market),
    JSON.stringify(message),
  );
}
