import { Hono, type Context } from "hono";
import {
  isBoundedPositiveInteger,
  isMarketSymbol,
  MAX_PAGE_LIMIT,
  type MarketSymbol,
} from "@cex/exchange-types";
import {
  MARKET_DATA_CONSUMER_GROUP,
  MARKET_DATA_STREAM,
} from "@cex/app-contracts";
import {
  checkConsumerGroup,
  maxMdLag,
  pingRedis,
  type RedisHealthClient,
} from "@cex/logger";
import type { Pool } from "pg";
import { listBbo, listCandles, listTrades } from "./history.js";

const MARKETS: MarketSymbol[] = ["SOL-USD", "SOL-USD-PERP"];

export function createHistoryApp(
  pool: Pool,
  options: {
    internalToken: string;
    redis?: RedisHealthClient;
  },
) {
  const app = new Hono();

  app.use("*", async (c, next) => {
    if (c.req.path === "/health" || c.req.path === "/health/live") {
      await next();
      return;
    }
    if (c.req.header("x-internal-token") !== options.internalToken) {
      return errorResponse(c, 401, "UNAUTHORIZED");
    }
    await next();
  });

  app.get("/health/live", (c) =>
    c.json({ ok: true, service: "ingester", live: true }),
  );

  app.get("/health", async (c) => {
    let timescale = {
      ok: true as boolean,
      detail: undefined as string | undefined,
    };
    try {
      await pool.query("SELECT 1");
    } catch (error) {
      timescale = {
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
      };
    }

    const redis = options.redis
      ? await pingRedis(options.redis)
      : { ok: true as boolean, detail: "not-configured" };
    const marketData = options.redis
      ? await checkConsumerGroup(
          options.redis,
          MARKET_DATA_STREAM,
          MARKET_DATA_CONSUMER_GROUP,
          maxMdLag(),
        )
      : {
          ok: true as boolean,
          stream: MARKET_DATA_STREAM,
          group: MARKET_DATA_CONSUMER_GROUP,
          exists: false,
          lag: null,
          pending: null,
          detail: "not-configured",
        };

    const ok = timescale.ok && redis.ok && marketData.ok;
    return c.json(
      {
        ok,
        service: "ingester",
        markets: MARKETS,
        dependencies: {
          timescale,
          redis,
          marketData,
        },
      },
      ok ? 200 : 503,
    );
  });

  app.get("/markets", (c) => c.json({ markets: MARKETS }));

  app.get("/markets/:market/trades", async (c) => {
    const market = parseMarket(c.req.param("market"));
    if (!market) return errorResponse(c, 404, "UNKNOWN_MARKET");
    const limit = parseLimit(c);
    if (limit === null) return errorResponse(c, 400, "INVALID_LIMIT");
    try {
      return c.json({
        trades: await listTrades(pool, market, limit),
      });
    } catch {
      return errorResponse(c, 503, "TIMESCALE_UNAVAILABLE");
    }
  });

  app.get("/markets/:market/bbo", async (c) => {
    const market = parseMarket(c.req.param("market"));
    if (!market) return errorResponse(c, 404, "UNKNOWN_MARKET");
    const limit = parseLimit(c);
    if (limit === null) return errorResponse(c, 400, "INVALID_LIMIT");
    try {
      return c.json({
        snapshots: await listBbo(pool, market, limit),
      });
    } catch {
      return errorResponse(c, 503, "TIMESCALE_UNAVAILABLE");
    }
  });

  app.get("/markets/:market/candles", async (c) => {
    const market = parseMarket(c.req.param("market"));
    if (!market) return errorResponse(c, 404, "UNKNOWN_MARKET");
    const limit = parseLimit(c);
    if (limit === null) return errorResponse(c, 400, "INVALID_LIMIT");
    try {
      return c.json({
        candles: await listCandles(pool, market, limit),
      });
    } catch {
      return errorResponse(c, 503, "TIMESCALE_UNAVAILABLE");
    }
  });

  app.onError((_error, c) => errorResponse(c, 500, "INTERNAL_ERROR"));
  return app;
}

function parseMarket(value: string): MarketSymbol | null {
  return isMarketSymbol(value) ? value : null;
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
