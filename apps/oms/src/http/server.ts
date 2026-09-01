import { Hono, type Context } from "hono";
import {
  isAppCommand,
  type PlaceCommand,
} from "@cex/app-contracts";
import {
  isBoundedPositiveInteger,
  isIdentifier,
  MAX_PAGE_LIMIT,
} from "@cex/exchange-types";
import {
  OrderNotFoundError,
  OrderOwnershipError,
  IdempotencyConflictError,
  OrderNotCancellableError,
  OrderService,
} from "../orders/service.js";

type ErrorStatus = 400 | 401 | 403 | 404 | 409 | 500;

export function createOmsApp(
  orderService: OrderService,
  options: { internalToken?: string | null } = {},
) {
  const app = new Hono();

  app.use("*", async (c, next) => {
    const requestId = c.req.header("x-request-id");
    c.header(
      "x-request-id",
      isIdentifier(requestId) ? requestId : crypto.randomUUID(),
    );

    if (!options.internalToken || c.req.path === "/health") {
      await next();
      return;
    }

    if (c.req.header("x-internal-token") !== options.internalToken) {
      return errorResponse(c, 401, "UNAUTHORIZED");
    }
    await next();
  });

  app.onError((error, c) =>
    errorResponse(
      c,
      500,
      "INTERNAL_ERROR",
      error instanceof Error ? error.message : "INTERNAL_ERROR",
    ),
  );

  app.get("/health", (c) =>
    c.json({
      ok: true,
      service: "oms",
    }),
  );

  app.post("/orders", async (c) => {
    const userId = authenticatedUserId(c);
    if (!userId) return errorResponse(c, 401, "UNAUTHORIZED");

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return errorResponse(c, 400, "INVALID_JSON");
    }

    const command = parsePlaceCommand(body, userId);
    if (!command) return errorResponse(c, 400, "INVALID_ORDER");

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
    const userId = authenticatedUserId(c);
    if (!userId) return errorResponse(c, 401, "UNAUTHORIZED");

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      body = {};
    }

    if (!isRecord(body)) {
      return errorResponse(c, 400, "INVALID_CANCEL");
    }
    const orderId = c.req.param("orderId");
    if (!isIdentifier(orderId)) {
      return errorResponse(c, 400, "INVALID_ORDER_ID");
    }
    if (
      body.clientOrderId !== undefined &&
      !isIdentifier(body.clientOrderId)
    ) {
      return errorResponse(c, 400, "INVALID_CLIENT_ORDER_ID");
    }

    try {
      const result = await orderService.cancel(
        userId,
        orderId,
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
    const userId = authenticatedUserId(c);
    if (!userId) return errorResponse(c, 401, "UNAUTHORIZED");

    const limitValue = c.req.query("limit");
    const limit = limitValue === undefined ? undefined : Number(limitValue);
    if (
      limit !== undefined &&
      (!Number.isInteger(limit) || !isBoundedPositiveInteger(limit, MAX_PAGE_LIMIT))
    ) {
      return errorResponse(c, 400, "INVALID_LIMIT");
    }
    const cursor = c.req.query("cursor");

    try {
      return c.json(await orderService.listForUser(userId, limit, cursor));
    } catch (error) {
      return errorResponse(c, error);
    }
  });

  app.get("/orders/:orderId", async (c) => {
    const userId = authenticatedUserId(c);
    if (!userId) return errorResponse(c, 401, "UNAUTHORIZED");
    const orderId = c.req.param("orderId");
    if (!isIdentifier(orderId)) {
      return errorResponse(c, 400, "INVALID_ORDER_ID");
    }

    try {
      return c.json(
        await orderService.getForUser(userId, orderId),
      );
    } catch (error) {
      return errorResponse(c, error);
    }
  });

  return app;
}

function parsePlaceCommand(
  value: unknown,
  userId: string,
): PlaceCommand | null {
  if (!isRecord(value)) return null;

  const candidate: Record<string, unknown> = {
    ...value,
    userId,
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
  status: ErrorStatus,
  code: string,
  message?: string,
): Response;
function errorResponse(context: Context, error: unknown): Response;
function errorResponse(
  context: Context,
  statusOrError: ErrorStatus | unknown,
  code?: string,
  message?: string,
) {
  if (typeof statusOrError === "number") {
    return context.json(
      errorBody(context, code ?? "OMS_ERROR", message),
      statusOrError as ErrorStatus,
    );
  }

  const error = statusOrError;
  if (error instanceof IdempotencyConflictError) {
    return context.json(errorBody(context, error.message), 409);
  }
  if (error instanceof Error && error.message === "INVALID_CURSOR") {
    return context.json(errorBody(context, error.message), 400);
  }
  if (error instanceof OrderNotFoundError) {
    return context.json(errorBody(context, error.message), 404);
  }
  if (error instanceof OrderOwnershipError) {
    return context.json(errorBody(context, error.message), 403);
  }
  if (error instanceof OrderNotCancellableError) {
    return context.json(errorBody(context, error.message), 409);
  }
  return context.json(
    errorBody(
      context,
      error instanceof Error ? error.message : "OMS_ERROR",
    ),
    500,
  );
}

function errorBody(context: Context, code: string, message = code) {
  return {
    error: {
      code,
      message,
      requestId: context.req.header("x-request-id"),
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function authenticatedUserId(context: Context): string | null {
  const userId = context.req.header("x-authenticated-user-id");
  return isIdentifier(userId) ? userId : null;
}