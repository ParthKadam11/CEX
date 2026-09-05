import {
  OrderType,
  Side,
  type AssetId,
  type MarketSymbol,
  type Order,
} from "@cex/exchange-types";
import {
  initialMargin,
  isPerpMarket,
  quoteNotional,
  resolveLeverage,
} from "./units.js";

// SOL-USD / SOL-USD-PERP → underlying base SOL, quote USD.
export function marketAssets(market: MarketSymbol): {
  base: AssetId;
  quote: AssetId;
} {
  switch (market) {
    case "SOL-USD":
    case "SOL-USD-PERP":
      return { base: "SOL", quote: "USD" };
    default: {
      const _exhaustive: never = market;
      throw new Error(`unknown market ${_exhaustive}`);
    }
  }
}

// Quote to lock for a buy limit, or base qty to lock for a sell limit (spot).
export function lockAmount(
  side: "BUY" | "SELL",
  price: number,
  quantity: number,
): number {
  return side === "BUY" ? quoteNotional(price, quantity) : quantity;
}

/**
 * How much of which asset to lock for this order.
 * Spot:
 *   - LIMIT buy: price × qty quote
 *   - LIMIT sell / MARKET sell: qty base
 *   - MARKET buy: quoteBudget
 * Perp:
 *   - always USD initial margin = ceil(notional / leverage)
 *   - LIMIT notional = price × qty
 *   - MARKET notional = quoteBudget (required)
 */
export function lockForOrder(
  order: Order,
): { asset: AssetId; amount: number } | null {
  if (isPerpMarket(order.market)) {
    return lockForPerpOrder(order);
  }

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

function lockForPerpOrder(
  order: Order,
): { asset: AssetId; amount: number } | null {
  const leverage = resolveLeverage(order);
  if (leverage < 1) return null;
  const qty = order.quantity - order.filledQuantity;
  if (qty <= 0 && order.type !== OrderType.MARKET) return null;

  let notional: number;
  if (order.type === OrderType.MARKET) {
    notional = order.quoteBudget ?? 0;
  } else {
    notional = quoteNotional(order.price, qty);
  }
  if (notional <= 0) return null;
  const amount = initialMargin(notional, leverage);
  if (amount <= 0) return null;
  return { asset: "USD", amount };
}

// Margin to attribute to a fill qty for lock release / position. *
export function marginForFill(order: Order, fillQty: number, tradePrice: number): {
  // Amount to release from the order's tracked lock. 
  orderLockRelease: number;
  // Margin retained on the position for this fill (open/increase share). 
  positionMargin: number;
  // Excess lock to unlock back to available (limit improvement / unused). 
  unlockExcess: number;
} {
  const leverage = resolveLeverage(order);
  const positionMargin = initialMargin(
    quoteNotional(tradePrice, fillQty),
    leverage,
  );

  if (order.type === OrderType.MARKET) {
    return {
      orderLockRelease: positionMargin,
      positionMargin,
      unlockExcess: 0,
    };
  }

  // LIMIT: lock was sized on limit price; release that, keep trade-priced margin.
  const reserved = initialMargin(quoteNotional(order.price, fillQty), leverage);
  const unlockExcess = Math.max(0, reserved - positionMargin);
  return {
    orderLockRelease: reserved,
    positionMargin,
    unlockExcess,
  };
}
