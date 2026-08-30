import { Hono, type Context } from "hono";
import {
  isAppCommand,
  type PlaceCommand,
} from "@cex/app-contracts";
import {
  OrderNotFoundError,
  OrderOwnershipError,
  OrderService,
} from "../orders/service.js";

export function createOmsApp(orderService: OrderService) {
  const app = new Hono();

  app.get("/health", (c) =>
    c.json({
      ok: true,
      service: "oms",
    }),
  );

  app.post("/orders", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "INVALID_JSON" }, 400);
    }

    const command = parsePlaceCommand(body);
    if (!command) return c.json({ error: "INVALID_ORDER" }, 400);

    try {
      const result = await orderService.place(command);
      return c.json(
        {
          order: result.order,
          commandId: result.command.commandId,
          existing: result.existing,
        },
        result.existing ? 200 : 202,
      );
    } catch (error) {
      return errorResponse(c, error);
    }
  });

  app.delete("/orders/:orderId", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "INVALID_JSON" }, 400);
    }

    if (!isRecord(body) || typeof body.userId !== "string") {
      return c.json({ error: "INVALID_CANCEL" }, 400);
    }

    try {
      const result = await orderService.cancel(
        body.userId,
        c.req.param("orderId"),
        typeof body.clientOrderId === "string"
          ? body.clientOrderId
          : undefined,
      );
      return c.json(
        {
          order: result.order,
          commandId: result.command.commandId,
        },
        202,
      );
    } catch (error) {
      return errorResponse(c, error);
    }
  });

  app.get("/orders", async (c) => {
    const userId = c.req.query("userId");
    if (!userId) return c.json({ error: "MISSING_USER_ID" }, 400);

    const limitValue = c.req.query("limit");
    const limit = limitValue === undefined ? undefined : Number(limitValue);
    if (limit !== undefined && !Number.isFinite(limit)) {
      return c.json({ error: "INVALID_LIMIT" }, 400);
    }

    try {
      return c.json(await orderService.listForUser(userId, limit));
    } catch (error) {
      return errorResponse(c, error);
    }
  });

  app.get("/orders/:orderId", async (c) => {
    const userId = c.req.query("userId");
    if (!userId) return c.json({ error: "MISSING_USER_ID" }, 400);

    try {
      return c.json(
        await orderService.getForUser(userId, c.req.param("orderId")),
      );
    } catch (error) {
      return errorResponse(c, error);
    }
  });

  return app;
}

function parsePlaceCommand(value: unknown): PlaceCommand | null {
  if (!isRecord(value)) return null;

  const candidate: Record<string, unknown> = {
    ...value,
    commandId: crypto.randomUUID(),
    type: "PLACE",
    timestamp: Date.now(),
    orderId:
      value.orderId === undefined ? crypto.randomUUID() : value.orderId,
  };

  if (!isAppCommand(candidate) || candidate.type !== "PLACE") return null;
  return candidate;
}

function errorResponse(
  context: Context,
  error: unknown,
) {
  if (error instanceof OrderNotFoundError) {
    return context.json({ error: error.message }, 404);
  }
  if (error instanceof OrderOwnershipError) {
    return context.json({ error: error.message }, 403);
  }
  return context.json(
    {
      error: error instanceof Error ? error.message : "OMS_ERROR",
    },
    500,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}