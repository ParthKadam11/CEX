import type Redis from "ioredis";
import type {
  AppCommand,
  AppOrderEvent,
  CancelCommand,
  CreditCommand,
  DebitCommand,
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
    const ids = correlation(command, this.primaryMarket);

    if (await this.dedupe.isProcessed(command.commandId)) {
      this.metrics.increment("commandsDuplicate");
      log("debug", "duplicate command skipped", ids);
      return;
    }

    const cached = await this.dedupe.loadOutcome(command.commandId);
    if (cached) {
      this.metrics.increment("commandsOutcomeReplay");
      log("debug", "replaying saved command outcome", {
        ...ids,
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
        ...ids,
        type: command.type,
        error: reason,
      });

      // If the engine result is already journaled, keep it for retry replay.
      // Do not replace a successful outcome with COMMAND_FAILED.
      const retained = await this.dedupe.loadOutcome(command.commandId);
      if (retained) {
        log("warn", "command outcome retained for retry", {
          ...ids,
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
          ...ids,
          error:
            publishErr instanceof Error
              ? publishErr.message
              : String(publishErr),
        });
      }
    }
  }

  private marketOf(command: AppCommand): MarketSymbol {
    if (command.type === "CREDIT" || command.type === "DEBIT") {
      return command.market ?? this.primaryMarket;
    }
    return command.market;
  }

  private async execute(command: AppCommand): Promise<AppOrderEvent[]> {
    switch (command.type) {
      case "CREDIT":
        return this.executeCredit(command);
      case "DEBIT":
        return this.executeDebit(command);
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
        undefined,
        command.requestId,
      );
      return [
        withRequestId(command, {
          eventId: eventId(command.commandId, "CREDIT_OK"),
          commandId: command.commandId,
          type: "CREDIT_OK",
          userId: command.userId,
          market,
          timestamp: Date.now(),
        }),
      ];
    } catch (err) {
      this.metrics.increment("commandsFailed");
      return [
        withRequestId(command, {
          eventId: eventId(command.commandId, "CREDIT_FAILED"),
          commandId: command.commandId,
          type: "CREDIT_FAILED",
          userId: command.userId,
          market,
          reason: err instanceof Error ? err.message : String(err),
          timestamp: Date.now(),
        }),
      ];
    }
  }

  private async executeDebit(command: DebitCommand): Promise<AppOrderEvent[]> {
    const market = command.market ?? this.primaryMarket;
    try {
      const engine = this.engines.get(market);
      await engine.debit(
        command.userId,
        command.asset,
        command.amount,
        command.commandId,
        undefined,
        command.requestId,
      );
      return [
        withRequestId(command, {
          eventId: eventId(command.commandId, "DEBIT_OK"),
          commandId: command.commandId,
          type: "DEBIT_OK",
          userId: command.userId,
          market,
          timestamp: Date.now(),
        }),
      ];
    } catch (err) {
      this.metrics.increment("commandsFailed");
      return [
        withRequestId(command, {
          eventId: eventId(command.commandId, "DEBIT_FAILED"),
          commandId: command.commandId,
          type: "DEBIT_FAILED",
          userId: command.userId,
          market,
          reason: err instanceof Error ? err.message : String(err),
          timestamp: Date.now(),
        }),
      ];
    }
  }

  private async executePlace(command: PlaceCommand): Promise<AppOrderEvent[]> {
    const engine = this.engines.get(command.market);
    const order = toEngineOrder(command);
    const result = await engine.place(order, undefined, command.requestId);
    return placeEvents(command, result);
  }

  private async executeCancel(command: CancelCommand): Promise<AppOrderEvent[]> {
    const engine = this.engines.get(command.market);
    const result = await engine.cancel(
      command.orderId,
      undefined,
      command.requestId,
    );
    if (result.cancelled) {
      return [
        withRequestId(command, {
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
        }),
      ];
    }

    return [
      withRequestId(command, {
        eventId: eventId(command.commandId, "COMMAND_FAILED"),
        commandId: command.commandId,
        type: "COMMAND_FAILED",
        userId: command.userId,
        market: command.market,
        orderId: command.orderId,
        clientOrderId: command.clientOrderId,
        reason: result.reason ?? "CANCEL_FAILED",
        timestamp: Date.now(),
      }),
    ];
  }

  private commandFailedEvent(
    command: AppCommand,
    reason: string,
  ): AppOrderEvent {
    return withRequestId(command, {
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
    });
  }

  private async publishAll(events: AppOrderEvent[]): Promise<void> {
    for (const event of events) {
      await publishOrderEvent(this.redis, event);
      this.metrics.increment("eventsPublished");
      // Hot path: only surface rejects/failures at warn; success stays debug.
      const noisyFailure =
        event.type === "REJECTED" ||
        event.type === "COMMAND_FAILED" ||
        event.type === "CREDIT_FAILED" ||
        event.type === "DEBIT_FAILED";
      log(noisyFailure ? "warn" : "debug", "command event published", {
        type: event.type,
        requestId: event.requestId,
        commandId: event.commandId,
        orderId: event.orderId,
        eventId: event.eventId,
        market: event.market,
        userId: event.userId,
        ...(noisyFailure && event.reason ? { reason: event.reason } : {}),
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
      withRequestId(command, {
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
      }),
    ];
  }

  const events: AppOrderEvent[] = [
    withRequestId(command, {
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
    }),
  ];

  if (
    result.order.status === "OPEN" ||
    result.order.status === "PARTIALLY_FILLED"
  ) {
    events.push(
      withRequestId(command, {
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
      }),
    );
  }

  for (const position of result.positions ?? []) {
    events.push(
      withRequestId(command, {
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
      }),
    );
  }

  return events;
}

function withRequestId(
  command: AppCommand,
  event: AppOrderEvent,
): AppOrderEvent {
  return command.requestId
    ? { ...event, requestId: command.requestId }
    : event;
}

function correlation(
  command: AppCommand,
  primaryMarket: MarketSymbol,
): {
  requestId?: string;
  commandId: string;
  orderId?: string;
  market: MarketSymbol;
  userId: string;
} {
  return {
    requestId: command.requestId,
    commandId: command.commandId,
    orderId:
      command.type === "PLACE" || command.type === "CANCEL"
        ? command.orderId
        : undefined,
    market:
      command.type === "CREDIT" || command.type === "DEBIT"
        ? (command.market ?? primaryMarket)
        : command.market,
    userId: command.userId,
  };
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
