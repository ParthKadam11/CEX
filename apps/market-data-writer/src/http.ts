import { Hono, type Context } from "hono";
import {
  isBoundedPositiveInteger,
  MAX_PAGE_LIMIT,
} from "@cex/exchange-types";
import type { Pool } from "pg";
import { listBbo, listCandles, listTrades } from "./history.js";

export function createHistoryApp(
  pool: Pool,
  options: { internalToken: string },
) {
  const app = new Hono();

  app.use("*", async (c, next) => {
    if (c.req.path === "/health") {
      await next();
      return;
    }
    if (c.req.header("x-internal-token") !== options.internalToken) {
      return errorResponse(c, 401, "UNAUTHORIZED");
    }
    await next();
  });

  app.get("/health", async (c) => {
    try {
      await pool.query("SELECT 1");
      return c.json({ ok: true, service: "market-data-writer" });
    } catch {
      return errorResponse(c, 503, "TIMESCALE_UNAVAILABLE");
    }
  });

  app.get("/markets/:market/trades", async (c) => {
    if (c.req.param("market") !== "SOL-USD") {
      return errorResponse(c, 404, "UNKNOWN_MARKET");
    }
    const limit = parseLimit(c);
    if (limit === null) return errorResponse(c, 400, "INVALID_LIMIT");
    try {
      return c.json({
        trades: await listTrades(pool, "SOL-USD", limit),
      });
    } catch {
      return errorResponse(c, 503, "TIMESCALE_UNAVAILABLE");
    }
  });

  app.get("/markets/:market/bbo", async (c) => {
    if (c.req.param("market") !== "SOL-USD") {
      return errorResponse(c, 404, "UNKNOWN_MARKET");
    }
    const limit = parseLimit(c);
    if (limit === null) return errorResponse(c, 400, "INVALID_LIMIT");
    try {
      return c.json({
        snapshots: await listBbo(pool, "SOL-USD", limit),
      });
    } catch {
      return errorResponse(c, 503, "TIMESCALE_UNAVAILABLE");
    }
  });

  app.get("/markets/:market/candles", async (c) => {
    if (c.req.param("market") !== "SOL-USD") {
      return errorResponse(c, 404, "UNKNOWN_MARKET");
    }
    const limit = parseLimit(c);
    if (limit === null) return errorResponse(c, 400, "INVALID_LIMIT");
    try {
      return c.json({
        candles: await listCandles(pool, "SOL-USD", limit),
      });
    } catch {
      return errorResponse(c, 503, "TIMESCALE_UNAVAILABLE");
    }
  });

  app.onError((_error, c) => errorResponse(c, 500, "INTERNAL_ERROR"));
  return app;
}

function parseLimit(context: Context): number | null {
  const value = context.req.query("limit");
  if (value === undefined) return 50;
  const limit = Number(value);
  return isBoundedPositiveInteger(limit, MAX_PAGE_LIMIT) ? limit : null;
}

function errorResponse(
  context: Context,
  status: 400 | 401 | 404 | 500 | 503,
  code: string,
) {
  return context.json(
    {
      error: {
        code,
        message: code,
      },
    },
    status,
  );
}
