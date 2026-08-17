import type { AssetId, MarketSymbol } from "@cex/exchange-types";

// SOL-USD → base SOL, quote USD (extend when more markets land). 
export function marketAssets(market: MarketSymbol): {
  base: AssetId;
  quote: AssetId;
} {
  switch (market) {
    case "SOL-USD":
      return { base: "SOL", quote: "USD" };
    default: {
      const _exhaustive: never = market;
      throw new Error(`unknown market ${_exhaustive}`);
    }
  }
}

//Quote to lock for a buy limit, or base qty to lock for a sell. 
export function lockAmount(
  side: "BUY" | "SELL",
  price: number,
  quantity: number,
): number {
  return side === "BUY" ? price * quantity : quantity;
}
