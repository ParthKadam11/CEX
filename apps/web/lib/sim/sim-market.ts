/**
 * Active market for the sim market-maker helpers.
 * Heartbeat / API set this before calling tick / fund / book ops.
 */
import {
  isMarketSymbol,
  type MarketSymbol,
} from "@cex/exchange-types";

export const SIM_MARKETS = ["SOL-USD", "SOL-USD-PERP"] as const satisfies readonly MarketSymbol[];

let activeMarket: MarketSymbol = "SOL-USD";

export function parseSimMarket(value: unknown): MarketSymbol {
  if (typeof value === "string" && isMarketSymbol(value)) return value;
  return "SOL-USD";
}

export function getSimMarket(): MarketSymbol {
  return activeMarket;
}

export function setSimMarket(market: MarketSymbol): void {
  activeMarket = market;
}

export function isPerpMarket(market: MarketSymbol = activeMarket): boolean {
  return market === "SOL-USD-PERP";
}
