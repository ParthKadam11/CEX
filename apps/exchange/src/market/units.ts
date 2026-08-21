import {
  OrderType,
  type Market,
  type MarketSymbol,
  type Order,
} from "@cex/exchange-types";

/*
  Engine money / size is integer only.

  SOL-USD (this process):
    1 lot      = 1 base unit (SOL)
    1 tick     = 1 quote unit per lot (USD)
    notional   = priceTicks × qtyLots   (integer quote units)

  IEEE floats are rejected at the API and placement boundary.
  Matching uses floor division so a leftover budget cannot buy a fraction of a lot.
*/

export class UnsafeUnitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeUnitError";
  }
}

export const SOL_USD: Market = {
  symbol: "SOL-USD",
  base: "SOL",
  quote: "USD",
  tickSize: 1,
  lotSize: 1,
  status: "OPEN",
};

export function marketSpec(market: MarketSymbol): Market {
  switch (market) {
    case "SOL-USD":
      return SOL_USD;
    default: {
      const _exhaustive: never = market;
      throw new Error(`unknown market ${_exhaustive}`);
    }
  }
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
  const spec = marketSpec(order.market);
  if (!isPositiveUnit(order.quantity)) return false;
  if (!isAligned(order.quantity, spec.lotSize)) return false;
  if (!isUnit(order.filledQuantity)) return false;
  if (order.filledQuantity > order.quantity) return false;

  if (order.type === OrderType.MARKET) {
    if (order.price !== 0) return false;
    if (
      order.quoteBudget !== undefined &&
      !isPositiveUnit(order.quoteBudget)
    ) {
      return false;
    }
    return true;
  }

  return (
    isPositiveUnit(order.price) && isAligned(order.price, spec.tickSize)
  );
}
