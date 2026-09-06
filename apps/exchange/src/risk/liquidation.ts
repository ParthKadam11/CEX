import { Side, type Position } from "@cex/exchange-types";

export const LIQUIDATOR_USER_ID = "sim-liquidator";

export type LiquidationClose = {
  side: Side;
  quantity: number;
  price: number;
};

// Unrealized PnL in USD ticks: works for long and short.
export function unrealizedPnl(
  size: number,
  entryPrice: number,
  mark: number,
): number {
  return size * (mark - entryPrice);
}

// Equity = margin + unrealized PnL.
export function positionEquity(
  margin: number,
  size: number,
  entryPrice: number,
  mark: number,
): number {
  return margin + unrealizedPnl(size, entryPrice, mark);
}

// Maintenance = ceil(|size| * mark * bps / 10_000).
export function maintenanceRequirement(
  size: number,
  mark: number,
  maintenanceMarginBps: number,
): number {
  const notional = Math.abs(size) * mark;
  return Math.ceil((notional * maintenanceMarginBps) / 10_000);
}

export function isLiquidatable(
  position: Position,
  mark: number | null | undefined,
  maintenanceMarginBps: number,
): boolean {
  if (position.size === 0) return false;
  if (mark == null || !Number.isSafeInteger(mark) || mark <= 0) return false;
  const equity = positionEquity(
    position.margin,
    position.size,
    position.entryPrice,
    mark,
  );
  const maintenance = maintenanceRequirement(
    position.size,
    mark,
    maintenanceMarginBps,
  );
  return equity < maintenance;
}

// Approximate mark where equity equals maintenance (integer ticks).
// Long: floor; short: ceil. Returns null when undefined.
export function approximateLiquidationPrice(
  position: Position,
  maintenanceMarginBps: number,
): number | null {
  if (position.size === 0) return null;
  const mmRate = maintenanceMarginBps / 10_000;
  const abs = Math.abs(position.size);
  if (abs === 0) return null;

  if (position.size > 0) {
    const denom = 1 - mmRate;
    if (denom <= 0) return null;
    const price = (position.entryPrice - position.margin / abs) / denom;
    if (!Number.isFinite(price)) return null;
    return Math.floor(price);
  }

  const denom = 1 + mmRate;
  const price = (position.entryPrice + position.margin / abs) / denom;
  if (!Number.isFinite(price)) return null;
  return Math.ceil(price);
}

// Full close instructions at mark (force-close side).
export function buildLiquidationClose(
  position: Position,
  mark: number,
): LiquidationClose {
  if (position.size === 0) {
    throw new Error("cannot build liquidation close for flat position");
  }
  if (!Number.isSafeInteger(mark) || mark <= 0) {
    throw new Error("liquidation mark must be a positive integer");
  }
  return {
    side: position.size > 0 ? Side.SELL : Side.BUY,
    quantity: Math.abs(position.size),
    price: mark,
  };
}

export type PositionRiskView = Position & {
  mark: number | null;
  unrealizedPnl: number | null;
  equity: number | null;
  maintenance: number | null;
  liquidatable: boolean;
  liquidationPrice: number | null;
};

export function enrichPositionRisk(
  position: Position,
  mark: number | null,
  maintenanceMarginBps: number,
): PositionRiskView {
  if (position.size === 0 || mark == null || mark <= 0) {
    return {
      ...position,
      mark,
      unrealizedPnl: null,
      equity: null,
      maintenance: null,
      liquidatable: false,
      liquidationPrice:
        position.size === 0
          ? null
          : approximateLiquidationPrice(position, maintenanceMarginBps),
    };
  }

  const upnl = unrealizedPnl(position.size, position.entryPrice, mark);
  const equity = position.margin + upnl;
  const maintenance = maintenanceRequirement(
    position.size,
    mark,
    maintenanceMarginBps,
  );
  return {
    ...position,
    mark,
    unrealizedPnl: upnl,
    equity,
    maintenance,
    liquidatable: equity < maintenance,
    liquidationPrice: approximateLiquidationPrice(
      position,
      maintenanceMarginBps,
    ),
  };
}
