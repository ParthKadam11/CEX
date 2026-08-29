import Redis from "ioredis";
import {
  ORDERS_COMMANDS_STREAM,
  ORDERS_EVENTS_STREAM,
  type AppCommand,
  type AppOrderEvent,
  mdBboChannel,
  mdTradeChannel,
} from "@cex/app-contracts";
import {
  EngineClient,
} from "../../src/engine/client.js";
import {
  OrderType,
  Side,
  TimeInForce,
} from "@cex/exchange-types";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
const exchangeUrl = (
  process.env.EXCHANGE_URL ?? "http://127.0.0.1:4010"
).replace(/\/$/, "");
const market = "SOL-USD" as const;
const testPrefix = `gateway-test-${Date.now()}-${process.pid}`;

const redis = new Redis(redisUrl);
const subscriber = redis.duplicate();
const engine = new EngineClient(exchangeUrl, market);
const pubsubMessages: Array<{ channel: string; payload: unknown }> = [];

beforeAll(async () => {
  try {
    await redis.ping();
    await engine.health();

    subscriber.on("message", (channel, rawPayload) => {
      try {
        pubsubMessages.push({ channel, payload: JSON.parse(rawPayload) });
      } catch {
        // Ignore malformed messages; the assertion will simply not find one.
      }
    });
    await subscriber.subscribe(mdBboChannel(market), mdTradeChannel(market));
  } catch (error) {
    throw new Error(
      "Gateway integration prerequisites failed. Start Redis, exchange, and engine-gateway first.",
      { cause: error },
    );
  }
});

afterAll(() => {
  subscriber.disconnect();
  redis.disconnect();
});

describe("engine-gateway integration", () => {
  it("executes a CREDIT command and publishes its result", async () => {
    const command: AppCommand = {
      commandId: `${testPrefix}-credit`,
      type: "CREDIT",
      userId: `${testPrefix}-credit-user`,
      asset: "USD",
      amount: 100_000,
      timestamp: Date.now(),
    };

    const events = await sendCommand(command);

    expect(events).toContainEqual(
      expect.objectContaining({
        commandId: command.commandId,
        type: "CREDIT_OK",
        userId: command.userId,
      }),
    );
  });

  it("places and then cancels a resting order", async () => {
    const userId = `${testPrefix}-cancel-user`;
    await sendCredit(`${testPrefix}-cancel-credit`, userId, "USD", 100_000);

    const orderId = `${testPrefix}-cancel-order`;
    const placeCommand: AppCommand = {
      commandId: `${testPrefix}-place`,
      type: "PLACE",
      userId,
      clientOrderId: `${testPrefix}-client-order`,
      market,
      side: Side.BUY,
      orderType: OrderType.LIMIT,
      timeInForce: TimeInForce.GTC,
      price: 100,
      quantity: 1,
      orderId,
      timestamp: Date.now(),
    };

    const placeEvents = await sendCommand(placeCommand);
    expect(placeEvents).toContainEqual(
      expect.objectContaining({
        commandId: placeCommand.commandId,
        type: "ACCEPTED",
        orderId,
      }),
    );
    expect(placeEvents).toContainEqual(
      expect.objectContaining({
        commandId: placeCommand.commandId,
        type: "RESTING",
        orderId,
      }),
    );

    const cancelCommand: AppCommand = {
      commandId: `${testPrefix}-cancel`,
      type: "CANCEL",
      userId,
      clientOrderId: placeCommand.clientOrderId,
      orderId,
      market,
      timestamp: Date.now(),
    };

    const cancelEvents = await sendCommand(cancelCommand);
    expect(cancelEvents).toContainEqual(
      expect.objectContaining({
        commandId: cancelCommand.commandId,
        type: "CANCELLED",
        orderId,
      }),
    );
  });

  it("publishes a BBO message when an order changes the book", async () => {
    const userId = `${testPrefix}-bbo-user`;
    await sendCredit(`${testPrefix}-bbo-credit`, userId, "USD", 100_000);

    const price = 10_000 + Math.floor(Math.random() * 10_000);
    const command: AppCommand = {
      commandId: `${testPrefix}-bbo-place`,
      type: "PLACE",
      userId,
      clientOrderId: `${testPrefix}-bbo-client`,
      market,
      side: Side.BUY,
      orderType: OrderType.LIMIT,
      timeInForce: TimeInForce.GTC,
      price,
      quantity: 1,
      orderId: `${testPrefix}-bbo-order`,
      timestamp: Date.now(),
    };

    await sendCommand(command);

    const message = await waitForPubsub(
      mdBboChannel(market),
      (payload): payload is { bestBid: number } =>
        isRecord(payload) && payload.bestBid === price,
    );
    expect(message).toEqual(expect.objectContaining({ bestBid: price }));

    await sendCommand({
      commandId: `${testPrefix}-bbo-cancel`,
      type: "CANCEL",
      userId,
      orderId: command.orderId!,
      market,
      timestamp: Date.now(),
    });
  });

  it("publishes a complete trade tick for a matched order", async () => {
    const seller = `${testPrefix}-seller`;
    const buyer = `${testPrefix}-buyer`;
    const price = 30_000 + Math.floor(Math.random() * 10_000);
    const sellOrderId = `${testPrefix}-sell-order`;
    const buyOrderId = `${testPrefix}-buy-order`;

    await sendCredit(`${testPrefix}-seller-credit`, seller, "SOL", 1);
    await sendCredit(`${testPrefix}-buyer-credit`, buyer, "USD", price);

    await sendCommand({
      commandId: `${testPrefix}-sell`,
      type: "PLACE",
      userId: seller,
      clientOrderId: `${testPrefix}-sell-client`,
      market,
      side: Side.SELL,
      orderType: OrderType.LIMIT,
      timeInForce: TimeInForce.GTC,
      price,
      quantity: 1,
      orderId: sellOrderId,
      timestamp: Date.now(),
    });

    const buyCommand: AppCommand = {
      commandId: `${testPrefix}-buy`,
      type: "PLACE",
      userId: buyer,
      clientOrderId: `${testPrefix}-buy-client`,
      market,
      side: Side.BUY,
      orderType: OrderType.LIMIT,
      timeInForce: TimeInForce.GTC,
      price,
      quantity: 1,
      orderId: buyOrderId,
      timestamp: Date.now(),
    };

    const buyEvents = await sendCommand(buyCommand);
    const fill = buyEvents.find((event) => event.type === "FILL");
    expect(fill?.fills).toHaveLength(1);

    const tradeId = fill?.fills?.[0]?.tradeId;
    expect(tradeId).toBeDefined();

    const message = await waitForPubsub(
      mdTradeChannel(market),
      (payload): payload is {
        tradeId: string;
        buyOrderId: string;
        sellOrderId: string;
      } =>
        isRecord(payload) &&
        payload.tradeId === tradeId &&
        payload.buyOrderId === buyOrderId &&
        payload.sellOrderId === sellOrderId,
    );

    expect(message).toEqual(
      expect.objectContaining({
        tradeId,
        buyOrderId,
        sellOrderId,
      }),
    );
  });
});

async function sendCredit(
  commandId: string,
  userId: string,
  asset: "SOL" | "USD",
  amount: number,
): Promise<void> {
  await sendCommand({
    commandId,
    type: "CREDIT",
    userId,
    asset,
    amount,
    timestamp: Date.now(),
  });
}

async function sendCommand(command: AppCommand): Promise<AppOrderEvent[]> {
  const streamId = await redis.xadd(
    ORDERS_COMMANDS_STREAM,
    "*",
    "payload",
    JSON.stringify(command),
  );
  if (!streamId) throw new Error("Redis did not return a command stream ID");

  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const rows = await redis.xrange(ORDERS_EVENTS_STREAM, "-", "+");
    const events = rows
      .map(([, fields]) => parseEvent(fields))
      .filter((event): event is AppOrderEvent => event !== null)
      .filter((event) => event.commandId === command.commandId);

    if (events.length > 0) return events;
    await sleep(100);
  }

  throw new Error(`Timed out waiting for command ${command.commandId}`);
}

async function waitForPubsub(
  channel: string,
  predicate: (payload: unknown) => boolean,
): Promise<unknown> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const message = pubsubMessages.find(
      (entry) => entry.channel === channel && predicate(entry.payload),
    );
    if (message) return message.payload;
    await sleep(50);
  }

  throw new Error(`Timed out waiting for pub/sub message on ${channel}`);
}

function parseEvent(fields: string[]): AppOrderEvent | null {
  for (let i = 0; i < fields.length; i += 2) {
    const payload = fields[i + 1];
    if (fields[i] !== "payload" || !payload) continue;
    try {
      return JSON.parse(payload) as AppOrderEvent;
    } catch {
      return null;
    }
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
