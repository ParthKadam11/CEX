import type Redis from "ioredis";
import type { BboMessage } from "@cex/app-contracts";
import type { Trade } from "@cex/exchange-types";
import type { GatewayMetrics } from "../metrics.js";
import { log } from "../logger.js";
import {
  publishBbo,
  publishMarketDataEvent,
  publishTrade,
} from "./pubsub.js";

export async function publishBboSnapshot(
  redis: Redis,
  metrics: GatewayMetrics,
  message: BboMessage,
): Promise<void> {
  await publishMarketDataEvent(redis, {
    eventId: `bbo-${message.market}-${message.engineSequence}`,
    kind: "BBO",
    payload: message,
  });
  await publishBbo(redis, message);
  metrics.increment("bboPublished");
  log("info", "BBO published", { market: message.market });
}

export async function publishTradeTick(
  redis: Redis,
  metrics: GatewayMetrics,
  trade: Trade,
): Promise<void> {
  const payload = {
    market: trade.market,
    tradeId: trade.tradeId,
    engineSequence: trade.engineSequence,
    price: trade.price,
    quantity: trade.quantity,
    buyOrderId: trade.buyOrderId,
    sellOrderId: trade.sellOrderId,
    timestamp: trade.timestamp,
  };

  await publishMarketDataEvent(redis, {
    eventId: `trade-${trade.market}-${trade.tradeId}`,
    kind: "TRADE",
    payload,
  });
  await publishTrade(redis, payload);
  metrics.increment("tradesPublished");
  log("info", "trade published", {
    market: trade.market,
    tradeId: trade.tradeId,
  });
}
