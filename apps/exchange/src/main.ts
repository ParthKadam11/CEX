import path from "node:path";
import { isMarketSymbol, type MarketSymbol } from "@cex/exchange-types";
import { serve } from "@hono/node-server";
import { EventBus } from "./api/eventBus.js";
import { createExchangeApp } from "./api/server.js";
import { MarketRuntime } from "./market/runtime.js";

/*
  Exchange process entrypoint.

  REST  → place / cancel / credit / queries / book / positions
  SSE   → /v1/markets/:market/stream  (ORDER, BBO, CREDIT, TRADE, POSITION)

  One process hosts one or more markets (default: spot + perps).
  Each market keeps its own WAL / book / balances / positions.
*/

const markets = resolveMarkets();
const port = Number(process.env.EXCHANGE_PORT ?? 4010);
const gatewayToken = serviceToken(
  "EXCHANGE_GATEWAY_TOKEN",
  "local-dev-exchange-token",
);
const dataDir =
  process.env.EXCHANGE_DATA_DIR ?? path.join(process.cwd(), "data");

const bus = new EventBus();
const runtimes = new Map<MarketSymbol, MarketRuntime>();
for (const market of markets) {
  const walPath =
    markets.length === 1 && process.env.EXCHANGE_WAL_PATH
      ? process.env.EXCHANGE_WAL_PATH
      : path.join(dataDir, `${market}.jsonl`);
  runtimes.set(market, MarketRuntime.open(market, walPath, bus));
}

const app = createExchangeApp(runtimes, bus, { gatewayToken });

const shutdown = () => {
  void Promise.all([...runtimes.values()].map((rt) => rt.close())).finally(
    () => process.exit(0),
  );
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(
    `exchange listening on http://localhost:${info.port} markets=[${[...runtimes.keys()].join(", ")}] data=${dataDir}`,
  );
});

/**
 * EXCHANGE_MARKETS=SOL-USD,SOL-USD-PERP (default)
 * EXCHANGE_MARKET=SOL-USD — single-market override (legacy / tests)
 */
function resolveMarkets(): MarketSymbol[] {
  const listed = process.env.EXCHANGE_MARKETS?.trim();
  if (listed) {
    const markets: MarketSymbol[] = [];
    for (const part of listed.split(",")) {
      const market = part.trim();
      if (!market) continue;
      if (!isMarketSymbol(market)) {
        throw new Error(`invalid EXCHANGE_MARKETS entry: ${market}`);
      }
      if (!markets.includes(market)) markets.push(market);
    }
    if (markets.length === 0) {
      throw new Error("EXCHANGE_MARKETS is empty");
    }
    return markets;
  }

  const single = process.env.EXCHANGE_MARKET?.trim();
  if (single) {
    if (!isMarketSymbol(single)) {
      throw new Error(`invalid EXCHANGE_MARKET: ${single}`);
    }
    return [single];
  }

  return ["SOL-USD", "SOL-USD-PERP"];
}

function serviceToken(name: string, fallback: string): string {
  const token = process.env[name];
  if (process.env.NODE_ENV === "production" && !token) {
    throw new Error(`${name} is required in production`);
  }
  return token ?? fallback;
}
