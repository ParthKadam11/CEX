import type {
  CancelCommand,
  PlaceCommand,
} from "@cex/app-contracts";
import { OmsOrderStatus } from "@cex/db/enums";
import { isMarketSymbol, type MarketSymbol } from "@cex/exchange-types";
import type Redis from "ioredis";
import {
  publishCancelCommand,
  publishPlaceCommand,
} from "../redis/commands.js";
import { OrderRepository } from "./repository.js";

export type PlaceOrderInput = Omit<
  PlaceCommand,
  "type" | "commandId" | "timestamp" | "orderId"
> & {
  commandId?: string;
  timestamp?: number;
  orderId?: string;
};

export class OrderNotFoundError extends Error {
  constructor() {
    super("ORDER_NOT_FOUND");
  }
}

export class OrderOwnershipError extends Error {
  constructor() {
    super("ORDER_ACCESS_DENIED");
  }
}

export class IdempotencyConflictError extends Error {
  constructor() {
    super("IDEMPOTENCY_CONFLICT");
  }
}

export class OrderNotCancellableError extends Error {
  constructor() {
    super("ORDER_NOT_CANCELLABLE");
  }
}

const TERMINAL_STATUSES = new Set<OmsOrderStatus>([
  OmsOrderStatus.FILLED,
  OmsOrderStatus.CANCELLED,
  OmsOrderStatus.REJECTED,
  OmsOrderStatus.FAILED,
]);

export class OrderService {
  constructor(
    private readonly repository: OrderRepository,
    private readonly redis: Redis,
  ) {}

  async place(input: PlaceOrderInput) {
    const engineOrderId = input.orderId ?? crypto.randomUUID();
    const command: PlaceCommand = {
      ...input,
      type: "PLACE",
      commandId: input.commandId ?? crypto.randomUUID(),
      orderId: engineOrderId,
      timestamp: input.timestamp ?? Date.now(),
    };

    const existing = await this.repository.findByClientOrderId(
      command.userId,
      command.clientOrderId,
    );
    if (existing) {
      assertSameOrder(command, existing);
      return {
        order: existing,
        command: originalCommand(command, existing),
        existing: true,
      };
    }

    let order;
    try {
      order = await this.repository.createPending(command, engineOrderId);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;

      const raced = await this.repository.findByClientOrderId(
        command.userId,
        command.clientOrderId,
      );
      if (!raced) throw error;
      assertSameOrder(command, raced);
      return {
        order: raced,
        command: originalCommand(command, raced),
        existing: true,
      };
    }

    try {
      await publishPlaceCommand(this.redis, command);
      await this.repository.markOutboxPublished(command.commandId);
    } catch (error) {
      throw error;
    }

    return { order, command, existing: false };
  }

  async cancel(
    userId: string,
    engineOrderId: string,
    clientOrderId?: string,
  ) {
    const order = await this.repository.findByEngineOrderId(engineOrderId);
    if (!order) throw new OrderNotFoundError();
    if (order.userId !== userId) throw new OrderOwnershipError();
    if (!isMarketSymbol(order.market)) {
      throw new Error("UNSUPPORTED_MARKET");
    }
    if (TERMINAL_STATUSES.has(order.status)) {
      throw new OrderNotCancellableError();
    }
    if (order.status === OmsOrderStatus.CANCEL_REQUESTED) {
      return {
        order,
        command: cancelCommandFromOrder(order, userId, clientOrderId),
      };
    }

    const command = cancelCommandFromOrder(order, userId, clientOrderId);
    const updated = await this.repository.requestCancel(
      order.id,
      command.commandId,
      command,
    );

    try {
      await publishCancelCommand(this.redis, command);
      await this.repository.markOutboxPublished(command.commandId);
    } catch (error) {
      throw error;
    }

    return { order: updated, command };
  }

  async getForUser(userId: string, engineOrderId: string) {
    const order = await this.repository.findByEngineOrderId(engineOrderId);
    if (!order) throw new OrderNotFoundError();
    if (order.userId !== userId) throw new OrderOwnershipError();
    return order;
  }

  listForUser(userId: string, limit?: number, cursor?: string) {
    return this.repository.listForUser(userId, limit, cursor);
  }

  relayOutbox(limit = 50) {
    return this.repository.listUnpublishedOutbox(limit);
  }

  async publishOutboxEntry(
    payload: PlaceCommand | CancelCommand,
  ): Promise<void> {
    if (payload.type === "PLACE") {
      await publishPlaceCommand(this.redis, payload);
    } else {
      await publishCancelCommand(this.redis, payload);
    }
    await this.repository.markOutboxPublished(payload.commandId);
  }
}

function cancelCommandFromOrder(
  order: {
    engineOrderId: string;
    market: string;
    cancelCommandId: string | null;
  },
  userId: string,
  clientOrderId?: string,
): CancelCommand {
  return {
    commandId: order.cancelCommandId ?? crypto.randomUUID(),
    type: "CANCEL",
    userId,
    clientOrderId,
    orderId: order.engineOrderId,
    market: order.market as MarketSymbol,
    timestamp: Date.now(),
  };
}

function originalCommand(
  command: PlaceCommand,
  existing: { placeCommandId: string; engineOrderId: string },
): PlaceCommand {
  return {
    ...command,
    commandId: existing.placeCommandId,
    orderId: existing.engineOrderId,
  };
}

function assertSameOrder(
  command: PlaceCommand,
  existing: {
    market: string;
    side: string;
    type: string;
    timeInForce: string;
    price: number;
    quantity: number;
    quoteBudget: number | null;
  },
): void {
  if (
    command.market !== existing.market ||
    command.side !== existing.side ||
    command.orderType !== existing.type ||
    command.timeInForce !== existing.timeInForce ||
    command.price !== existing.price ||
    command.quantity !== existing.quantity ||
    (command.quoteBudget ?? null) !== existing.quoteBudget
  ) {
    throw new IdempotencyConflictError();
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}
