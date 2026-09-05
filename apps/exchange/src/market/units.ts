import {
  isBoundedPositiveInteger,
  isIdentifier,
  isTimestamp,
  MAX_ORDER_PRICE,
  MAX_ORDER_QUANTITY,
  MAX_QUOTE_BUDGET,
  OrderType,
  Side,
  TimeInForce,
  type Market,
  type MarketSymbol,
  type Order,
} from "@cex/exchange-types";

/*
  Engine money / size is integer only.

  SOL-USD (spot):
    1 lot      = 1 base unit (SOL)
    1 tick     = 1 quote unit per lot (USD)
    notional   = priceTicks × qtyLots

  SOL-USD-PERP:
    Same tick/lot units; settlement is USD margin + position, not SOL delivery.
*/

export class UnsafeUnitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeUnitError";
  }
}

export const SOL_USD: Market = {
  symbol: "SOL-USD",
  kind: "SPOT",
  base: "SOL",
  quote: "USD",
  collateral: "USD",
  tickSize: 1,
  lotSize: 1,
  status: "OPEN",
};

export const SOL_USD_PERP: Market = {
  symbol: "SOL-USD-PERP",
  kind: "PERP",
  base: "SOL",
  quote: "USD",
  collateral: "USD",
  tickSize: 1,
  lotSize: 1,
  status: "OPEN",
  defaultLeverage: 1,
  maxLeverage: 20,
  maintenanceMarginBps: 50,
};

export function marketSpec(market: MarketSymbol): Market {
  switch (market) {
    case "SOL-USD":
      return SOL_USD;
    case "SOL-USD-PERP":
      return SOL_USD_PERP;
    default: {
      const _exhaustive: never = market;
      throw new Error(`unknown market ${_exhaustive}`);
    }
  }
}

export function isPerpMarket(market: MarketSymbol): boolean {
  return marketSpec(market).kind === "PERP";
}

/** Non-negative integer in Number.MAX_SAFE_INTEGER. */
export function isUnit(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

export function isPositiveUnit(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

export function assertUnit(value: number, label = "amount"): number {
  if (!isUnit(value)) {
    throw new UnsafeUnitError(
      `${label} must be a non-negative safe integer, got ${value}`,
    );
  }
  return value;
}

export function assertPositiveUnit(value: number, label = "amount"): number {
  if (!isPositiveUnit(value)) {
    throw new UnsafeUnitError(
      `${label} must be a positive safe integer, got ${value}`,
    );
  }
  return value;
}

/** Quote notional in integer quote units: ticks × lots. */
export function quoteNotional(priceTicks: number, qtyLots: number): number {
  assertUnit(priceTicks, "price");
  assertUnit(qtyLots, "quantity");
  const product = priceTicks * qtyLots;
  if (!Number.isSafeInteger(product)) {
    throw new UnsafeUnitError(
      `quote notional ${priceTicks} * ${qtyLots} exceeds MAX_SAFE_INTEGER`,
    );
  }
  return product;
}

/**
 * Initial margin for a notional at leverage (ceil division).
 * notional=100, lev=3 → 34
 */
export function initialMargin(notional: number, leverage: number): number {
  assertUnit(notional, "notional");
  if (!Number.isSafeInteger(leverage) || leverage < 1) {
    throw new UnsafeUnitError(`leverage must be a positive integer, got ${leverage}`);
  }
  if (notional === 0) return 0;
  return Math.floor((notional + leverage - 1) / leverage);
}

// Resolve order leverage against market bounds. */
export function resolveLeverage(order: Order): number {
  const spec = marketSpec(order.market);
  const raw = order.leverage ?? spec.defaultLeverage ?? 1;
  const max = spec.maxLeverage ?? 1;
  if (!Number.isSafeInteger(raw) || raw < 1 || raw > max) {
    return 0; // signal invalid to orderUnitsOk
  }
  return raw;
}

/** Whole lots a quote budget can buy at this price (floor). */
export function lotsForBudget(quoteUnits: number, priceTicks: number): number {
  assertUnit(quoteUnits, "budget");
  if (!isPositiveUnit(priceTicks)) return 0;
  return Math.floor(quoteUnits / priceTicks);
}

export function isAligned(value: number, step: number): boolean {
  return isUnit(value) && isPositiveUnit(step) && value % step === 0;
}

/** True when price / qty / budget are safe integers aligned to the market. */
export function orderUnitsOk(order: Order): boolean {
  if (
    (order.market !== "SOL-USD" && order.market !== "SOL-USD-PERP") ||
    !isIdentifier(order.orderId) ||
    !isIdentifier(order.userId) ||
    !isTimestamp(order.timestamp) ||
    (order.side !== Side.BUY && order.side !== Side.SELL) ||
    (order.type !== OrderType.LIMIT && order.type !== OrderType.MARKET) ||
    !Object.values(TimeInForce).includes(order.timeInForce)
  ) {
    return false;
  }

  const spec = marketSpec(order.market);
  if (!isBoundedPositiveInteger(order.quantity, MAX_ORDER_QUANTITY)) {
    return false;
  }
  if (!isAligned(order.quantity, spec.lotSize)) return false;
  if (!isUnit(order.filledQuantity)) return false;
  if (order.filledQuantity > order.quantity) return false;

  if (spec.kind === "PERP") {
    if (resolveLeverage(order) < 1) return false;
    // Market perps need a notional cap for margin (both sides).
    if (
      order.type === OrderType.MARKET &&
      !isBoundedPositiveInteger(order.quoteBudget, MAX_QUOTE_BUDGET)
    ) {
      return false;
    }
  }

  if (order.type === OrderType.MARKET) {
    if (order.price !== 0) return false;
    if (
      order.quoteBudget !== undefined &&
      !isBoundedPositiveInteger(order.quoteBudget, MAX_QUOTE_BUDGET)
    ) {
      return false;
    }
    if (
      order.side === Side.BUY &&
      spec.kind === "SPOT" &&
      !isBoundedPositiveInteger(order.quoteBudget, MAX_QUOTE_BUDGET)
    ) {
      return false;
    }
    return (
      order.timeInForce !== TimeInForce.FOK_BUDGET ||
      (order.side === Side.BUY &&
        isBoundedPositiveInteger(order.quoteBudget, MAX_QUOTE_BUDGET))
    );
  }

  return (
    isBoundedPositiveInteger(order.price, MAX_ORDER_PRICE) &&
    isAligned(order.price, spec.tickSize) &&
    order.timeInForce !== TimeInForce.FOK_BUDGET
  );
}
