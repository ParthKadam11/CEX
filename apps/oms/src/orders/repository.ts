import type { AppCommand, AppOrderEvent, PlaceCommand } from "@cex/app-contracts";
import { prisma, type PrismaClient } from "@cex/db";
import {
  OrderSide,
  OrderTimeInForce,
  OrderType,
  OmsOrderStatus,
} from "@cex/db/enums";
import { MAX_PAGE_LIMIT } from "@cex/exchange-types";

export class OrderRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  async health(): Promise<void> {
    await this.db.$queryRaw`SELECT 1`;
  }

  async createPending(command: PlaceCommand, engineOrderId: string) {
    return this.db.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          engineOrderId,
          placeCommandId: command.commandId,
          clientOrderId: command.clientOrderId,
          userId: command.userId,
          market: command.market,
          side: command.side === "BUY" ? OrderSide.BUY : OrderSide.SELL,
          type:
            command.orderType === "LIMIT" ? OrderType.LIMIT : OrderType.MARKET,
          timeInForce: toDbTimeInForce(command.timeInForce),
          price: command.price,
          quantity: command.quantity,
          quoteBudget: command.quoteBudget,
          status: OmsOrderStatus.PENDING,
        },
        include: { fills: true },
      });
      await tx.commandOutbox.create({
        data: {
          commandId: command.commandId,
          payload: command,
        },
      });
      return order;
    });
  }

  async findById(id: string) {
    return this.db.order.findUnique({
      where: { id },
      include: { fills: true },
    });
  }

  async findByEngineOrderId(engineOrderId: string) {
    return this.db.order.findUnique({
      where: { engineOrderId },
      include: { fills: true },
    });
  }

  async findByClientOrderId(userId: string, clientOrderId: string) {
    return this.db.order.findUnique({
      where: {
        userId_clientOrderId: {
          userId,
          clientOrderId,
        },
      },
      include: { fills: true },
    });
  }

  async listForUser(
    userId: string,
    limit = 50,
    cursor?: string,
  ) {
    const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), MAX_PAGE_LIMIT);
    const decoded = cursor ? decodeCursor(cursor) : null;
    const where = decoded
      ? {
          userId,
          OR: [
            { createdAt: { lt: decoded.createdAt } },
            { createdAt: decoded.createdAt, id: { lt: decoded.id } },
          ],
        }
      : { userId };

    const rows = await this.db.order.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: safeLimit + 1,
      include: { fills: true },
    });
    const orders = rows.slice(0, safeLimit);
    const last = orders.at(-1);
    return {
      orders,
      nextCursor:
        rows.length > safeLimit && last
          ? encodeCursor(last.createdAt, last.id)
          : null,
    };
  }

  async requestCancel(
    id: string,
    cancelCommandId: string,
    command: AppCommand,
  ) {
    return this.db.$transaction(async (tx) => {
      const order = await tx.order.update({
        where: { id },
        data: {
          cancelCommandId,
          status: OmsOrderStatus.CANCEL_REQUESTED,
        },
        include: { fills: true },
      });
      await tx.commandOutbox.create({
        data: {
          commandId: cancelCommandId,
          payload: command,
        },
      });
      return order;
    });
  }

  async markOutboxPublished(commandId: string) {
    await this.db.commandOutbox.updateMany({
      where: { commandId, publishedAt: null },
      data: { publishedAt: new Date() },
    });
  }

  async listUnpublishedOutbox(limit = 50) {
    return this.db.commandOutbox.findMany({
      where: { publishedAt: null },
      orderBy: { createdAt: "asc" },
      take: limit,
    });
  }

  async markFailed(id: string, failureReason: string) {
    return this.db.order.update({
      where: { id },
      data: {
        status: OmsOrderStatus.FAILED,
        failureReason,
      },
      include: { fills: true },
    });
  }

  async applyEvent(event: AppOrderEvent): Promise<boolean> {
    return this.db.$transaction(async (tx) => {
      try {
        await tx.omsProcessedEvent.create({
          data: {
            eventId: event.eventId,
            commandId: event.commandId,
            orderId: event.orderId,
            eventType: event.type,
          },
        });
      } catch (error) {
        if (isUniqueViolation(error)) return false;
        throw error;
      }

      if (!event.orderId) return true;

      const order = await tx.order.findUnique({
        where: { engineOrderId: event.orderId },
      });
      if (!order) return true;

      let newFillQuantity = 0;
      if (event.type === "FILL" && event.fills) {
        for (const fill of event.fills) {
          const existingFill = await tx.orderFill.findUnique({
            where: {
              orderId_tradeId: {
                orderId: order.id,
                tradeId: fill.tradeId,
              },
            },
          });
          if (existingFill) continue;

          await tx.orderFill.create({
            data: {
              orderId: order.id,
              tradeId: fill.tradeId,
              price: fill.price,
              quantity: fill.quantity,
            },
          });
          newFillQuantity += fill.quantity;
        }
      }

      const nextStatus = toOmsStatus(event);
      const staleEngineEvent =
        event.engineSequence !== undefined &&
        event.engineSequence <= order.lastEngineSequence &&
        event.type !== "FILL";
      const statusRegression =
        nextStatus !== null &&
        !shouldAdvanceStatus(order.status, nextStatus);
      const appliedStatus =
        nextStatus && !staleEngineEvent && !statusRegression
          ? nextStatus
          : undefined;
      const filledQuantity =
        event.order?.filledQuantity ??
        (newFillQuantity > 0
          ? order.filledQuantity + newFillQuantity
          : order.filledQuantity);
      const lastEngineSequence =
        event.engineSequence !== undefined
          ? Math.max(order.lastEngineSequence, event.engineSequence)
          : order.lastEngineSequence;

      await tx.order.update({
        where: { id: order.id },
        data: {
          status: appliedStatus,
          filledQuantity,
          lastEngineSequence,
          failureReason:
            event.type === "REJECTED" || event.type === "COMMAND_FAILED"
              ? event.reason
              : undefined,
        },
      });

      return true;
    });
  }
}

function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(
    JSON.stringify({ createdAt: createdAt.toISOString(), id }),
  ).toString("base64url");
}

function decodeCursor(value: string): { createdAt: Date; id: string } {
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as { createdAt?: unknown; id?: unknown };
    if (
      typeof parsed.createdAt !== "string" ||
      typeof parsed.id !== "string"
    ) {
      throw new Error();
    }
    const createdAt = new Date(parsed.createdAt);
    if (Number.isNaN(createdAt.getTime())) throw new Error();
    return { createdAt, id: parsed.id };
  } catch {
    throw new Error("INVALID_CURSOR");
  }
}

function toDbTimeInForce(
  value: PlaceCommand["timeInForce"],
): OrderTimeInForce {
  switch (value) {
    case "IOC":
      return OrderTimeInForce.IOC;
    case "FOK":
      return OrderTimeInForce.FOK;
    case "FOK_BUDGET":
      return OrderTimeInForce.FOK_BUDGET;
    default:
      return OrderTimeInForce.GTC;
  }
}

function toOmsStatus(event: AppOrderEvent): OmsOrderStatus | null {
  if (event.type === "ACCEPTED") return OmsOrderStatus.ACCEPTED;
  if (event.type === "RESTING") {
    return event.status === "PARTIALLY_FILLED"
      ? OmsOrderStatus.PARTIALLY_FILLED
      : OmsOrderStatus.OPEN;
  }
  if (event.type === "FILL") {
    return event.status === "PARTIALLY_FILLED"
      ? OmsOrderStatus.PARTIALLY_FILLED
      : OmsOrderStatus.FILLED;
  }
  if (event.type === "CANCELLED") return OmsOrderStatus.CANCELLED;
  if (event.type === "REJECTED") return OmsOrderStatus.REJECTED;
  if (event.type === "COMMAND_FAILED") return OmsOrderStatus.FAILED;
  return null;
}

const STATUS_RANK: Record<OmsOrderStatus, number> = {
  [OmsOrderStatus.PENDING]: 0,
  [OmsOrderStatus.ACCEPTED]: 10,
  [OmsOrderStatus.OPEN]: 20,
  [OmsOrderStatus.PARTIALLY_FILLED]: 30,
  [OmsOrderStatus.CANCEL_REQUESTED]: 35,
  [OmsOrderStatus.FILLED]: 40,
  [OmsOrderStatus.CANCELLED]: 40,
  [OmsOrderStatus.REJECTED]: 40,
  [OmsOrderStatus.FAILED]: 40,
};

function shouldAdvanceStatus(
  current: OmsOrderStatus,
  next: OmsOrderStatus,
): boolean {
  return STATUS_RANK[next] >= STATUS_RANK[current];
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}
