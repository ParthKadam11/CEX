import type { PlaceCommand } from "@cex/app-contracts";
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
