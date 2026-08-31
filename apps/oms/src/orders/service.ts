import type {
  CancelCommand,
  PlaceCommand,
} from "@cex/app-contracts";
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
    } catch (error) {
      await this.repository.markFailed(
        order.id,
        error instanceof Error ? error.message : String(error),
      );
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
    if (order.market !== "SOL-USD") {
      throw new Error("UNSUPPORTED_MARKET");
    }

    const command: CancelCommand = {
      commandId: crypto.randomUUID(),
      type: "CANCEL",
      userId,
      clientOrderId,
      orderId: engineOrderId,
      market: order.market,
      timestamp: Date.now(),
    };

    const updated = await this.repository.requestCancel(
      order.id,
      command.commandId,
    );

    try {
      await publishCancelCommand(this.redis, command);
    } catch (error) {
      await this.repository.markFailed(
        order.id,
        error instanceof Error ? error.message : String(error),
      );
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
