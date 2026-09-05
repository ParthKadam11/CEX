import type { MarketKind, MarketSymbol } from "@cex/exchange-types";
import { isMarketSymbol } from "@cex/exchange-types";

export type TradingVenue = {
  symbol: MarketSymbol;
  kind: MarketKind;
  label: string;
  href: string;
  base: "SOL";
  quote: "USD";
};

export const SPOT_VENUE: TradingVenue = {
  symbol: "SOL-USD",
  kind: "SPOT",
  label: "Spot",
  href: "/spot",
  base: "SOL",
  quote: "USD",
};

export const PERP_VENUE: TradingVenue = {
  symbol: "SOL-USD-PERP",
  kind: "PERP",
  label: "Perps",
  href: "/perps",
  base: "SOL",
  quote: "USD",
};

export const TRADING_VENUES = [SPOT_VENUE, PERP_VENUE] as const;

export function venueForSymbol(symbol: string | null | undefined): TradingVenue {
  if (symbol === PERP_VENUE.symbol) return PERP_VENUE;
  return SPOT_VENUE;
}

export function parseMarketParam(value: string | null): MarketSymbol {
  if (value && isMarketSymbol(value)) return value;
  return "SOL-USD";
}
