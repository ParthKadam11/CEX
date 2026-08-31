import { existsSync } from "node:fs";
import path from "node:path";
import Redis from "ioredis";
import { config as loadDotenv } from "dotenv";
import {
  ORDERS_EVENTS_STREAM,
  type AppOrderEvent,
} from "@cex/app-contracts";
import { afterAll, describe, expect, it } from "vitest";

loadTestEnvironment();

const omsUrl = process.env.OMS_URL ?? "http://127.0.0.1:4030";
const omsToken = process.env.OMS_INTERNAL_TOKEN ?? "local-dev-oms-token";
const gatewayUrl =
  process.env.ENGINE_GATEWAY_URL ?? "http://127.0.0.1:4020";
const gatewayToken =
  process.env.ENGINE_GATEWAY_INTERNAL_TOKEN ?? "local-dev-gateway-token";
const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
const prefix = `oms-integration-${Date.now()}-${process.pid}`;
const redis = new Redis(redisUrl, {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
});
redis.on("error", () => undefined);

describe("OMS end-to-end flow", () => {
  it("persists, executes, and updates an order through the full pipeline", async () => {
    await waitForDependencies();
    const { prisma } = await import("@cex/db");
    let userId: string | null = null;
    const orderId = `${prefix}-order`;

    try {
      userId = await createTestUser(prisma);
      await sendCredit(userId);

      const response = await fetch(`${omsUrl}/orders`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-internal-token": omsToken,
          "x-authenticated-user-id": userId,
        },
        body: JSON.stringify({
          clientOrderId: `${prefix}-client`,
          market: "SOL-USD",
          side: "BUY",
          orderType: "LIMIT",
          timeInForce: "GTC",
          price: 100,
          quantity: 1,
          orderId,
        }),
      });

      expect(response.status).toBe(202);
      const created = (await response.json()) as {
        order: { engineOrderId: string; status: string };
      };
      expect(created.order.engineOrderId).toBe(orderId);
      expect(created.order.status).toBe("PENDING");

      const open = await waitForOrder(userId, orderId, (order) =>
        order.status === "OPEN",
      );
      expect(open.status).toBe("OPEN");

      const cancelResponse = await fetch(`${omsUrl}/orders/${orderId}`, {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
          "x-internal-token": omsToken,
          "x-authenticated-user-id": userId,
        },
        body: JSON.stringify({}),
      });
      expect(cancelResponse.status).toBe(202);

      const cancelled = await waitForOrder(userId, orderId, (order) =>
        order.status === "CANCELLED",
      );
      expect(cancelled.status).toBe("CANCELLED");
    } finally {
      if (!userId) {
        await prisma.$disconnect();
        return;
      }
      const orders = await prisma.order.findMany({
        where: { userId },
        select: { id: true },
      });
      await prisma.omsProcessedEvent.deleteMany({
        where: { orderId: { in: orders.map((order) => order.id) } },
      });
      await prisma.order.deleteMany({ where: { userId } });
      await prisma.user.delete({ where: { id: userId } });
      await prisma.$disconnect();
    }
  }, 20_000);
});

afterAll(() => {
  redis.disconnect();
});

async function createTestUser(
  prisma: typeof import("@cex/db").prisma,
): Promise<string> {
  const { Provider } = await import("@cex/db/enums");
  const user = await prisma.user.create({
    data: {
      username: `${prefix}-user`,
      email: `${prefix}@example.test`,
      provider: Provider.Google,
    },
  });
  return user.id;
}

async function sendCredit(userId: string): Promise<void> {
  const commandId = `${prefix}-credit`;
  const response = await fetch(`${gatewayUrl}/dev/inject-command`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-internal-token": gatewayToken,
    },
    body: JSON.stringify({
      commandId,
      type: "CREDIT",
      userId,
      asset: "USD",
      amount: 100_000,
      timestamp: Date.now(),
    }),
  });
  if (!response.ok) {
    throw new Error(`Credit injection failed with status ${response.status}`);
  }

  await waitForEvent(commandId, (event) => event.type === "CREDIT_OK");
}

async function waitForDependencies(): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const [response] = await Promise.all([
        fetch(`${omsUrl}/health`),
        redis.ping(),
      ]);
      if (response.ok) return;
    } catch {
      await sleep(100);
    }
  }
  throw new Error(
    "OMS dependencies are not reachable. Start Redis, exchange, engine-gateway, and OMS first.",
  );
}

async function waitForOrder(
  userId: string,
  orderId: string,
  predicate: (order: { status: string }) => boolean,
): Promise<{ status: string }> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const response = await fetch(
      `${omsUrl}/orders/${orderId}`,
      {
        headers: {
          "x-internal-token": omsToken,
          "x-authenticated-user-id": userId,
        },
      },
    );
    if (response.ok) {
      const order = (await response.json()) as { status: string };
      if (predicate(order)) return order;
    }
    await sleep(100);
  }
  throw new Error(`Timed out waiting for order ${orderId}`);
}

async function waitForEvent(
  commandId: string,
  predicate: (event: AppOrderEvent) => boolean,
): Promise<AppOrderEvent> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const rows = await redis.xrange(ORDERS_EVENTS_STREAM, "-", "+");
    for (const [, fields] of rows) {
      const rawPayload = fieldValue(fields, "payload");
      if (!rawPayload) continue;
      try {
        const event = JSON.parse(rawPayload) as AppOrderEvent;
        if (event.commandId === commandId && predicate(event)) return event;
      } catch {
        continue;
      }
    }
    await sleep(100);
  }
  throw new Error(`Timed out waiting for event ${commandId}`);
}

function fieldValue(fields: string[], key: string): string | null {
  for (let i = 0; i < fields.length; i += 2) {
    if (fields[i] === key) return fields[i + 1] ?? null;
  }
  return null;
}

function loadTestEnvironment(): void {
  const candidates = [
    path.resolve(process.cwd(), "../../packages/db/.env"),
    path.resolve(process.cwd(), "packages/db/.env"),
  ];
  const envPath = candidates.find((candidate) => existsSync(candidate));
  if (envPath) loadDotenv({ path: envPath });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
