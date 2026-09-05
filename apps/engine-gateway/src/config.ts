import {
  isMarketSymbol,
  type MarketSymbol,
} from "@cex/exchange-types";

export type EngineEndpoint = {
  market: MarketSymbol;
  url: string;
};

export type GatewayConfig = {
  port: number;
  redisUrl: string;
  /** Engines this gateway routes to (at least one). */
  engines: EngineEndpoint[];
  /** Default market for CREDIT without market + health display. */
  primaryMarket: MarketSymbol;
  /** Redis Streams consumer name within the gateway group. */
  consumerName: string;
  internalToken: string | null;
  exchangeToken: string;
};

export function loadConfig(): GatewayConfig {
  const port = Number(process.env.GATEWAY_PORT ?? 4020);
  const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
  const consumerName =
    process.env.GATEWAY_CONSUMER_NAME ?? `engine-gw-${process.pid}`;

  const engines = resolveEngines();
  const primaryRaw = process.env.GATEWAY_MARKET;
  const primaryMarket =
    primaryRaw && isMarketSymbol(primaryRaw)
      ? primaryRaw
      : engines[0]!.market;

  if (!engines.some((e) => e.market === primaryMarket)) {
    throw new Error(
      `GATEWAY_MARKET=${primaryMarket} is not in configured engines`,
    );
  }

  return {
    port,
    redisUrl,
    engines,
    primaryMarket,
    consumerName,
    internalToken: serviceToken(
      "GATEWAY_INTERNAL_TOKEN",
      "local-dev-gateway-token",
    ),
    exchangeToken: serviceToken(
      "EXCHANGE_GATEWAY_TOKEN",
      "local-dev-exchange-token",
    ),
  };
}

/**
 * Spot + perps default to the same exchange URL (one multi-market process on :4010).
 * Override EXCHANGE_PERP_URL only if you still run a separate perp process.
 * Or: EXCHANGE_URLS=SOL-USD=http://...,SOL-USD-PERP=http://...
 */
function resolveEngines(): EngineEndpoint[] {
  const listed = process.env.EXCHANGE_URLS?.trim();
  if (listed) {
    const engines: EngineEndpoint[] = [];
    for (const part of listed.split(",")) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) {
        throw new Error(`invalid EXCHANGE_URLS entry: ${trimmed}`);
      }
      const market = trimmed.slice(0, eq).trim();
      const url = trimmed.slice(eq + 1).trim().replace(/\/$/, "");
      if (!isMarketSymbol(market) || !url) {
        throw new Error(`invalid EXCHANGE_URLS entry: ${trimmed}`);
      }
      engines.push({ market, url });
    }
    if (engines.length === 0) {
      throw new Error("EXCHANGE_URLS is empty");
    }
    return engines;
  }

  const spotUrl = (
    process.env.EXCHANGE_URL ?? "http://127.0.0.1:4010"
  ).replace(/\/$/, "");
  const engines: EngineEndpoint[] = [{ market: "SOL-USD", url: spotUrl }];

  // Same host as spot by default (single exchange process hosts both markets).
  const perpRaw = process.env.EXCHANGE_PERP_URL;
  const perpUrl = (perpRaw === undefined ? spotUrl : perpRaw)
    .trim()
    .replace(/\/$/, "");
  if (perpUrl) {
    engines.push({ market: "SOL-USD-PERP", url: perpUrl });
  }

  return engines;
}

function serviceToken(name: string, fallback: string): string {
  const token = process.env[name];
  if (process.env.NODE_ENV === "production" && !token) {
    throw new Error(`${name} is required in production`);
  }
  return token ?? fallback;
}
