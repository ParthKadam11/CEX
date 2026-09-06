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
  type MarketSymbol,
  type Order,
  type PlacementResult,
} from "@cex/exchange-types";
import type { EngineRegistry } from "../engine/registry.js";
import type { CommandDedupe } from "../dedupe.js";
import { log } from "../logger.js";
import type { GatewayMetrics } from "../metrics.js";
import { publishOrderEvent } from "../redis/streams.js";

// One Redis command → engine HTTP → orders:events.
// Crash-safe: persist outcome before publish; retries replay outcome (engine is idempotent).

export class CommandHandler {
  constructor(
    private readonly engines: EngineRegistry,
    private readonly primaryMarket: MarketSymbol,
    private readonly redis: Redis,
    private readonly dedupe: CommandDedupe,
    private readonly metrics: GatewayMetrics,
  ) {}

  async handle(command: AppCommand): Promise<void> {
    if (await this.dedupe.isProcessed(command.commandId)) {
      this.metrics.increment("commandsDuplicate");
      log("info", "duplicate command skipped", {
        commandId: command.commandId,
      });
      return;
    }

    const cached = await this.dedupe.loadOutcome(command.commandId);
    if (cached) {
      this.metrics.increment("commandsOutcomeReplay");
      log("info", "replaying saved command outcome", {
        commandId: command.commandId,
        events: cached.length,
      });
      await this.publishAll(cached);
      await this.dedupe.markProcessed(command.commandId);
      return;
    }

    try {
      const events = await this.execute(command);
      await this.dedupe.saveOutcome(command.commandId, events);
      await this.publishAll(events);
      await this.dedupe.markProcessed(command.commandId);
    } catch (err) {
      this.metrics.increment("commandsFailed");
      const reason = err instanceof Error ? err.message : String(err);
      log("error", "command failed", {
        commandId: command.commandId,
        type: command.type,
        error: reason,
      });

      // If the engine result is already journaled, keep it for retry replay.
      // Do not replace a successful outcome with COMMAND_FAILED.
      const retained = await this.dedupe.loadOutcome(command.commandId);
      if (retained) {
        log("warn", "command outcome retained for retry", {
          commandId: command.commandId,
          events: retained.length,
        });
        return;
      }

      const failEvent = this.commandFailedEvent(command, reason);
      try {
        await this.dedupe.saveOutcome(command.commandId, [failEvent]);
        await this.publishAll([failEvent]);
        await this.dedupe.markProcessed(command.commandId);
      } catch (publishErr) {
        log("error", "failed to publish COMMAND_FAILED", {
          commandId: command.commandId,
          error:
            publishErr instanceof Error
              ? publishErr.message
              : String(publishErr),
        });
      }
    }
  }

  private marketOf(command: AppCommand): MarketSymbol {
    if (command.type === "CREDIT") {
      return command.market ?? this.primaryMarket;
    }
    return command.market;
  }

  private async execute(command: AppCommand): Promise<AppOrderEvent[]> {
    switch (command.type) {
      case "CREDIT":
        return this.executeCredit(command);
      case "PLACE":
        return this.executePlace(command);
      case "CANCEL":
        return this.executeCancel(command);
    }
  }

  private async executeCredit(command: CreditCommand): Promise<AppOrderEvent[]> {
    const market = command.market ?? this.primaryMarket;
    try {
      const engine = this.engines.get(market);
      await engine.credit(
        command.userId,
        command.asset,
        command.amount,
        command.commandId,
      );
      return [
        {
          eventId: eventId(command.commandId, "CREDIT_OK"),
          commandId: command.commandId,
          type: "CREDIT_OK",
          userId: command.userId,
          market,
          timestamp: Date.now(),
        },
      ];
    } catch (err) {
      this.metrics.increment("commandsFailed");
      return [
        {
          eventId: eventId(command.commandId, "CREDIT_FAILED"),
          commandId: command.commandId,
          type: "CREDIT_FAILED",
          userId: command.userId,
          market,
          reason: err instanceof Error ? err.message : String(err),
          timestamp: Date.now(),
        },
      ];
    }
  }

  private async executePlace(command: PlaceCommand): Promise<AppOrderEvent[]> {
    const engine = this.engines.get(command.market);
    const order = toEngineOrder(command);
    const result = await engine.place(order);
    return placeEvents(command, result);
  }

  private async executeCancel(command: CancelCommand): Promise<AppOrderEvent[]> {
    const engine = this.engines.get(command.market);
    const result = await engine.cancel(command.orderId);
    if (result.cancelled) {
      return [
        {
          eventId: eventId(command.commandId, "CANCELLED"),
          commandId: command.commandId,
          type: "CANCELLED",
          userId: command.userId,
          market: command.market,
          orderId: command.orderId,
          clientOrderId: command.clientOrderId,
          order: result.order,
          status: result.order?.status,
          timestamp: Date.now(),
        },
      ];
    }

    return [
      {
        eventId: eventId(command.commandId, "COMMAND_FAILED"),
        commandId: command.commandId,
        type: "COMMAND_FAILED",
        userId: command.userId,
        market: command.market,
        orderId: command.orderId,
        clientOrderId: command.clientOrderId,
        reason: result.reason ?? "CANCEL_FAILED",
        timestamp: Date.now(),
      },
    ];
  }

  private commandFailedEvent(
    command: AppCommand,
    reason: string,
  ): AppOrderEvent {
    return {
      eventId: eventId(command.commandId, "COMMAND_FAILED"),
      commandId: command.commandId,
      type: "COMMAND_FAILED",
      userId: command.userId,
      market: this.marketOf(command),
      orderId: command.type === "CANCEL" ? command.orderId : undefined,
      clientOrderId:
        command.type === "PLACE" || command.type === "CANCEL"
          ? command.clientOrderId
          : undefined,
      reason,
      timestamp: Date.now(),
    };
  }

  private async publishAll(events: AppOrderEvent[]): Promise<void> {
    for (const event of events) {
      await publishOrderEvent(this.redis, event);
      this.metrics.increment("eventsPublished");
      log("info", "command event published", {
        type: event.type,
        commandId: event.commandId,
        orderId: event.orderId,
        eventId: event.eventId,
      });
    }
  }
}

function placeEvents(
  command: PlaceCommand,
  result: PlacementResult,
): AppOrderEvent[] {
  if (!result.accepted) {
    return [
      {
        eventId: eventId(command.commandId, "REJECTED"),
        commandId: command.commandId,
        type: "REJECTED",
        userId: command.userId,
        market: command.market,
        orderId: result.order.orderId,
        clientOrderId: command.clientOrderId,
        order: result.order,
        status: result.order.status,
        reason: result.reason ?? "REJECTED",
        timestamp: Date.now(),
      },
    ];
  }

  const events: AppOrderEvent[] = [
    {
      eventId: eventId(command.commandId, "ACCEPTED"),
      commandId: command.commandId,
      type: "ACCEPTED",
      userId: command.userId,
      market: command.market,
      orderId: result.order.orderId,
      clientOrderId: command.clientOrderId,
      order: result.order,
      status: result.order.status,
      timestamp: Date.now(),
    },
  ];

  if (
    result.order.status === "OPEN" ||
    result.order.status === "PARTIALLY_FILLED"
  ) {
    events.push({
      eventId: eventId(command.commandId, "RESTING"),
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

  for (const position of result.positions ?? []) {
    events.push({
      eventId: eventId(
        command.commandId,
        "POSITION",
        `${position.userId}:${position.market}`,
      ),
      commandId: command.commandId,
      type: "POSITION",
      userId: position.userId,
      market: position.market,
      position: {
        size: position.size,
        entryPrice: position.entryPrice,
        margin: position.margin,
        leverage: position.leverage,
        updatedAt: position.updatedAt,
      },
      timestamp: position.updatedAt || Date.now(),
    });
  }

  return events;
}

function eventId(
  commandId: string,
  type: string,
  suffix?: string,
): string {
  return suffix
    ? `gw-${commandId}-${type}-${suffix}`
    : `gw-${commandId}-${type}`;
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
        : command.timeInForce === TimeInForce.FOK_BUDGET
          ? TimeInForce.FOK_BUDGET
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
    leverage: command.leverage,
    filledQuantity: 0,
    status: "NEW",
    timestamp: command.timestamp || Date.now(),
  };
}
