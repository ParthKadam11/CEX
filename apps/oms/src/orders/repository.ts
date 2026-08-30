import type { AppOrderEvent, PlaceCommand } from "@cex/app-contracts";
import { prisma, type PrismaClient } from "@cex/db";
import {
  OrderSide,
  OrderTimeInForce,
  OrderType,
  OmsOrderStatus,
} from "@cex/db/enums";

export class OrderRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  async createPending(
    command: PlaceCommand,
    engineOrderId: string,
  ) {
    return this.db.order.create({
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

  async listForUser(userId: string, limit = 50) {
    const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);

    return this.db.order.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: safeLimit,
      include: { fills: true },
    });
  }

  async requestCancel(id: string, cancelCommandId: string) {
    return this.db.order.update({
      where: { id },
      data: {
        cancelCommandId,
        status: OmsOrderStatus.CANCEL_REQUESTED,
      },
      include: { fills: true },
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

      if (event.type === "FILL" && event.fills) {
        for (const fill of event.fills) {
          await tx.orderFill.upsert({
            where: { tradeId: fill.tradeId },
            create: {
              orderId: order.id,
              tradeId: fill.tradeId,
              price: fill.price,
              quantity: fill.quantity,
            },
            update: {},
          });
        }
      }

      const nextStatus = toOmsStatus(event);
      const filledQuantity =
        event.order?.filledQuantity ??
        (event.fills
          ? order.filledQuantity +
            event.fills.reduce((total, fill) => total + fill.quantity, 0)
          : order.filledQuantity);

      await tx.order.update({
        where: { id: order.id },
        data: {
          status: nextStatus ?? undefined,
          filledQuantity,
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

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}
