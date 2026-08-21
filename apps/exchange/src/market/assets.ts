import { OrderType, Side, type AssetId, type MarketSymbol, type Order } from "@cex/exchange-types";
import { quoteNotional } from "./units.js";

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

// Quote to lock for a buy limit, or base qty to lock for a sell limit.
export function lockAmount(
  side: "BUY" | "SELL",
  price: number,
  quantity: number,
): number {
  return side === "BUY" ? quoteNotional(price, quantity) : quantity;
}

/**
  How much of which asset to lock for this order.
  - LIMIT buy: price × qty quote
  - LIMIT sell / MARKET sell: qty base
  - MARKET buy: quoteBudget (required)
 */
export function lockForOrder(
  order: Order,
): { asset: AssetId; amount: number } | null {
  const { base, quote } = marketAssets(order.market);
  const qty = order.quantity - order.filledQuantity;

  if (order.type === OrderType.MARKET) {
    if (order.side === Side.BUY) {
      const budget = order.quoteBudget ?? 0;
      if (budget <= 0) return null;
      return { asset: quote, amount: budget };
    }
    if (qty <= 0) return null;
    return { asset: base, amount: qty };
  }

  const asset = order.side === Side.BUY ? quote : base;
  const amount = lockAmount(order.side, order.price, qty);
  if (amount <= 0) return null;
  return { asset, amount };
}
