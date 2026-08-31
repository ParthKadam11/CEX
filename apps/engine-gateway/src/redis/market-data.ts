import Redis from "ioredis";
import {
  mdBboChannel,
  mdTradeChannel,
  type BboMessage,
  type TradeTickMessage,
} from "@cex/app-contracts";
import type { MarketSymbol } from "@cex/exchange-types";
import { isIdentifier, isSafePositiveInteger, isTimestamp } from "@cex/exchange-types";
import { log } from "../logger.js";

export type MarketDataMessage = BboMessage | TradeTickMessage;
export type MarketDataHandler = (message: MarketDataMessage) => void;

export function createRedisSubscriber(url: string): Redis {
  return new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });
}

export class MarketDataHub {
  private readonly handlers = new Set<MarketDataHandler>();
  private readonly channels: readonly string[];

  constructor(
    private readonly redis: Redis,
    market: MarketSymbol,
  ) {
    this.channels = [mdBboChannel(market), mdTradeChannel(market)];
    this.redis.on("message", (channel, rawPayload) => {
      this.dispatch(channel, rawPayload);
    });
  }

  async start(): Promise<void> {
    await this.redis.subscribe(...this.channels);
  }

  subscribe(handler: MarketDataHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  async close(): Promise<void> {
    await this.redis.unsubscribe(...this.channels);
    this.redis.disconnect();
  }

  private dispatch(channel: string, rawPayload: string): void {
    const message = parseMessage(channel, rawPayload);
    if (!message) return;

    for (const handler of this.handlers) {
      try {
        handler(message);
      } catch (error) {
        log("warn", "market data subscriber failed", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
}

function parseMessage(
  channel: string,
  rawPayload: string,
): MarketDataMessage | null {
  try {
    const value: unknown = JSON.parse(rawPayload);
    if (channel.includes(":bbo") && isBboMessage(value)) return value;
    if (channel.includes(":trade") && isTradeTickMessage(value)) return value;
  } catch {
    log("warn", "invalid market data message", { channel });
  }
  return null;
}

function isBboMessage(value: unknown): value is BboMessage {
  if (!isRecord(value)) return false;
  return (
    value.market === "SOL-USD" &&
    isNullableNumber(value.bestBid) &&
    isNullableNumber(value.bestAsk) &&
    isSafePositiveInteger(value.engineSequence) &&
    isTimestamp(value.timestamp)
  );
}

function isTradeTickMessage(value: unknown): value is TradeTickMessage {
  if (!isRecord(value)) return false;
  return (
    value.market === "SOL-USD" &&
    isIdentifier(value.tradeId) &&
    isSafePositiveInteger(value.engineSequence) &&
    isSafePositiveInteger(value.price) &&
    isSafePositiveInteger(value.quantity) &&
    isIdentifier(value.buyOrderId) &&
    isIdentifier(value.sellOrderId) &&
    isTimestamp(value.timestamp)
  );
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || typeof value === "number";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
