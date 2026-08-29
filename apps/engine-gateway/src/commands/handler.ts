import type Redis from "ioredis";
import type {
  AppCommand,
  AppOrderEvent,
  CancelCommand,
  CreditCommand,
  PlaceCommand,
} from "@cex/app-contracts";
import {
  OrderType,
  TimeInForce,
  type Order,
  type PlacementResult,
} from "@cex/exchange-types";
import type { EngineClient } from "../engine/client.js";
import type { CommandDedupe } from "../dedupe.js";
import { publishTrade } from "../redis/pubsub.js";
import { publishOrderEvent } from "../redis/streams.js";

// One Redis command → engine HTTP → orders:events. HTTP response decides success; SSE is a separate live path.

export class CommandHandler {
  constructor(
    private readonly engine: EngineClient,
    private readonly redis: Redis,
    private readonly dedupe: CommandDedupe,
  ) {}

  async handle(command: AppCommand): Promise<void> {
    if (this.dedupe.checkAndMark(command.commandId)) {
      console.log("[cmd] skip duplicate", command.commandId);
      return;
    }

    try {
      switch (command.type) {
        case "CREDIT":
          await this.handleCredit(command);
          return;
        case "PLACE":
          await this.handlePlace(command);
          return;
        case "CANCEL":
          await this.handleCancel(command);
          return;
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      await this.emit({
        eventId: crypto.randomUUID(),
        commandId: command.commandId,
        type: "COMMAND_FAILED",
        userId: command.userId,
        market: "market" in command ? command.market : "SOL-USD",
        orderId: command.type === "CANCEL" ? command.orderId : undefined,
        clientOrderId:
          command.type === "PLACE" || command.type === "CANCEL"
            ? command.clientOrderId
            : undefined,
        reason,
        timestamp: Date.now(),
      });
    }
  }

  private async handleCredit(command: CreditCommand): Promise<void> {
    try {
      await this.engine.credit(command.userId, command.asset, command.amount);
      await this.emit({
        eventId: crypto.randomUUID(),
        commandId: command.commandId,
        type: "CREDIT_OK",
        userId: command.userId,
        market: "SOL-USD",
        timestamp: Date.now(),
      });
    } catch (err) {
      await this.emit({
        eventId: crypto.randomUUID(),
        commandId: command.commandId,
        type: "CREDIT_FAILED",
        userId: command.userId,
        market: "SOL-USD",
        reason: err instanceof Error ? err.message : String(err),
        timestamp: Date.now(),
      });
    }
  }

  private async handlePlace(command: PlaceCommand): Promise<void> {
    const order = toEngineOrder(command);
    const result = await this.engine.place(order);
    await this.emitPlaceEvents(command, result);
    await this.publishTrades(result);
  }

  private async handleCancel(command: CancelCommand): Promise<void> {
    const result = await this.engine.cancel(command.orderId);
    if (result.cancelled) {
      await this.emit({
        eventId: crypto.randomUUID(),
        commandId: command.commandId,
        type: "CANCELLED",
        userId: command.userId,
        market: command.market,
        orderId: command.orderId,
        clientOrderId: command.clientOrderId,
        order: result.order,
        status: result.order?.status,
        timestamp: Date.now(),
      });
      return;
    }

    await this.emit({
      eventId: crypto.randomUUID(),
      commandId: command.commandId,
      type: "COMMAND_FAILED",
      userId: command.userId,
      market: command.market,
      orderId: command.orderId,
      clientOrderId: command.clientOrderId,
      reason: result.reason ?? "CANCEL_FAILED",
      timestamp: Date.now(),
    });
  }

  private async emitPlaceEvents(
    command: PlaceCommand,
    result: PlacementResult,
  ): Promise<void> {
    if (!result.accepted) {
      await this.emit({
        eventId: crypto.randomUUID(),
        commandId: command.commandId,
        type: "REJECTED",
        userId: command.userId,
        market: command.market,
        orderId: result.order.orderId,
        clientOrderId: command.clientOrderId,
        order: result.order,
        status: result.order.status,
        reason: "REJECTED",
        timestamp: Date.now(),
      });
      return;
    }

    await this.emit({
      eventId: crypto.randomUUID(),
      commandId: command.commandId,
      type: "ACCEPTED",
      userId: command.userId,
      market: command.market,
      orderId: result.order.orderId,
      clientOrderId: command.clientOrderId,
      order: result.order,
      status: result.order.status,
      timestamp: Date.now(),
    });

    if (result.trades.length > 0) {
      await this.emit({
        eventId: crypto.randomUUID(),
        commandId: command.commandId,
        type: "FILL",
        userId: command.userId,
        market: command.market,
        orderId: result.order.orderId,
        clientOrderId: command.clientOrderId,
        order: result.order,
        status: result.order.status,
        fills: result.trades.map((t) => ({
          tradeId: t.tradeId,
          price: t.price,
          quantity: t.quantity,
        })),
        timestamp: Date.now(),
      });
    }

    if (
      result.order.status === "OPEN" ||
      result.order.status === "PARTIALLY_FILLED"
    ) {
      await this.emit({
        eventId: crypto.randomUUID(),
        commandId: command.commandId,
        type: "RESTING",
        userId: command.userId,
        market: command.market,
        orderId: result.order.orderId,
        clientOrderId: command.clientOrderId,
        order: result.order,
        status: result.order.status,
        timestamp: Date.now(),
      });
    }
  }

  private async emit(event: AppOrderEvent): Promise<void> {
    await publishOrderEvent(this.redis, event);
    console.log("[cmd] event", event.type, event.commandId ?? event.orderId);
  }

  private async publishTrades(result: PlacementResult): Promise<void> {
    for (const trade of result.trades) {
      try {
        await publishTrade(this.redis, {
          market: trade.market,
          tradeId: trade.tradeId,
          price: trade.price,
          quantity: trade.quantity,
          buyOrderId: trade.buyOrderId,
          sellOrderId: trade.sellOrderId,
          timestamp: trade.timestamp,
        });
      } catch (error) {
        console.error(
          "[pubsub] trade publish failed:",
          error instanceof Error ? error.message : error,
        );
      }
    }
  }
}

function toEngineOrder(command: PlaceCommand): Order {
  const type =
    command.orderType === OrderType.MARKET
      ? OrderType.MARKET
      : OrderType.LIMIT;
  const tif =
    command.timeInForce === TimeInForce.IOC
      ? TimeInForce.IOC
      : command.timeInForce === TimeInForce.FOK
        ? TimeInForce.FOK
        : TimeInForce.GTC;

  return {
    orderId: command.orderId ?? crypto.randomUUID(),
    userId: command.userId,
    market: command.market,
    side: command.side,
    type,
    timeInForce: tif,
    price: type === OrderType.MARKET ? 0 : command.price,
    quantity: command.quantity,
    quoteBudget: command.quoteBudget,
    filledQuantity: 0,
    status: "NEW",
    timestamp: command.timestamp || Date.now(),
  };
}
