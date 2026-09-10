import path from "node:path";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isMarketSymbol, type MarketSymbol } from "@cex/exchange-types";
import { serve } from "@hono/node-server";
import { EventBus } from "./api/eventBus.js";
import { createExchangeApp } from "./api/server.js";
import { loadLocalEnv } from "./loadEnv.js";
import { log } from "./logger.js";
import { MarketRuntime } from "./market/runtime.js";

/*
  Exchange process entrypoint.

  REST  → place / cancel / credit / queries / book / positions
  SSE   → /v1/markets/:market/stream  (ORDER, BBO, CREDIT, TRADE, POSITION)

  One process hosts one or more markets (default: spot + perps).
  Each market keeps its own WAL / book / balances / positions.
*/

loadLocalEnv();

/** Always `apps/exchange`, even if the process was started from the monorepo root. */
const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const markets = resolveMarkets();
const port = Number(process.env.PORT ?? process.env.EXCHANGE_PORT ?? 4010);
const gatewayToken = serviceToken(
  "EXCHANGE_GATEWAY_TOKEN",
  "local-dev-exchange-token",
);
const dataDir = resolveDataDir();
ensureDataDir(dataDir);

const bus = new EventBus();
const runtimes = new Map<MarketSymbol, MarketRuntime>();
for (const market of markets) {
  const walPath = resolveWalPath(market, markets.length);
  runtimes.set(market, MarketRuntime.open(market, walPath, bus));
}

const app = createExchangeApp(runtimes, bus, { gatewayToken, dataDir });

const shutdown = () => {
  log.info("shutting down");
  void Promise.all([...runtimes.values()].map((rt) => rt.close())).finally(
    () => process.exit(0),
  );
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

serve({ fetch: app.fetch, port }, (info) => {
  log.info("HTTP server listening", {
    port: info.port,
    markets: [...runtimes.keys()],
    dataDir,
  });
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

/**
 * WAL + snapshots live under this directory.
 *
 * Local default: `<package>/data` (apps/exchange/data) — not process.cwd(),
 * so starting from the monorepo root still hits the same durable files.
 *
 * Production: EXCHANGE_DATA_DIR must point at a persistent volume mount.
 * Without that, container restarts wipe balances/orders even though WAL works.
 */
function resolveDataDir(): string {
  const configured = process.env.EXCHANGE_DATA_DIR?.trim();
  if (configured) {
    return path.resolve(configured);
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "EXCHANGE_DATA_DIR is required in production (mount a persistent disk for the WAL)",
    );
  }
  return path.join(packageRoot, "data");
}

function ensureDataDir(dir: string): void {
  try {
    mkdirSync(dir, { recursive: true });
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String((error as { code: unknown }).code)
        : "";
    if (code === "EACCES" || code === "EPERM") {
      throw new Error(
        `EXCHANGE_DATA_DIR=${dir} is not writable. On Render: Disks → add a disk with Mount Path exactly "${dir}", then set EXCHANGE_DATA_DIR to that same path.`,
      );
    }
    throw error;
  }
}

function resolveWalPath(market: MarketSymbol, marketCount: number): string {
  const single =
    marketCount === 1 ? process.env.EXCHANGE_WAL_PATH?.trim() : undefined;
  if (single) return path.resolve(single);
  return path.join(dataDir, `${market}.jsonl`);
}

function serviceToken(name: string, fallback: string): string {
  const token = process.env[name];
  if (process.env.NODE_ENV === "production" && !token) {
    throw new Error(`${name} is required in production`);
  }
  return token ?? fallback;
}
