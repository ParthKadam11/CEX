import type {
  CancelCommand,
  CreditCommand,
  PlaceCommand,
} from "@cex/app-contracts";
import type Redis from "ioredis";
import {
  publishCancelCommand,
  publishCreditCommand,
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

export class FundingNotFoundError extends Error {
  constructor() {
    super("USD_FUNDING_NOT_FOUND");
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
    if (existing) return { order: existing, command, existing: true };

    const order = await this.repository.createPending(
      command,
      engineOrderId,
    );

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

  async syncUsdFunding(userId: string) {
    const amount = await this.repository.findUsdBalance(userId);
    if (amount === null || amount <= 0) {
      throw new FundingNotFoundError();
    }

    const command: CreditCommand = {
      commandId: crypto.randomUUID(),
      type: "CREDIT",
      userId,
      asset: "USD",
      amount,
      timestamp: Date.now(),
    };
    const key = `oms:funding:initialized:${userId}:USD`;
    const claimed = await this.redis.set(key, command.commandId, "NX");

    if (claimed === null) {
      return { amount, commandId: null, existing: true };
    }

    try {
      await publishCreditCommand(this.redis, command);
    } catch (error) {
      await this.redis.del(key).catch(() => undefined);
      throw error;
    }

    return { amount, commandId: command.commandId, existing: false };
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

  listForUser(userId: string, limit?: number) {
    return this.repository.listForUser(userId, limit);
  }
}
