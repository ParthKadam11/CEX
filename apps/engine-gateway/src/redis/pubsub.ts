import type Redis from "ioredis";
import {
  MARKET_DATA_STREAM,
  MARKET_DATA_STREAM_MAXLEN,
  mdBboChannel,
  mdTradeChannel,
  type MarketDataEvent,
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

export async function publishMarketDataEvent(
  redis: Redis,
  event: MarketDataEvent,
): Promise<string> {
  const id = await redis.xadd(
    MARKET_DATA_STREAM,
    "MAXLEN",
    "~",
    MARKET_DATA_STREAM_MAXLEN,
    "*",
    "payload",
    JSON.stringify(event),
  );
  if (!id) throw new Error("xadd md:events returned null");
  return id;
}
