import type { Position } from "@cex/exchange-types";

// Matches exchange maintenanceMarginBps for SOL-USD-PERP.
export const PERP_MAINTENANCE_MARGIN_BPS = 50;

export function unrealizedPnl(
  size: number,
  entryPrice: number,
  mark: number,
): number {
  return size * (mark - entryPrice);
}

export function positionEquity(
  margin: number,
  size: number,
  entryPrice: number,
  mark: number,
): number {
  return margin + unrealizedPnl(size, entryPrice, mark);
}

export function maintenanceRequirement(
  size: number,
  mark: number,
  bps = PERP_MAINTENANCE_MARGIN_BPS,
): number {
  return Math.ceil((Math.abs(size) * mark * bps) / 10_000);
}

export function approximateLiquidationPrice(
  position: Position,
  bps = PERP_MAINTENANCE_MARGIN_BPS,
): number | null {
  if (position.size === 0) return null;
  const mmRate = bps / 10_000;
  const abs = Math.abs(position.size);
  if (position.size > 0) {
    const denom = 1 - mmRate;
    if (denom <= 0) return null;
    const price = (position.entryPrice - position.margin / abs) / denom;
    return Number.isFinite(price) ? Math.floor(price) : null;
  }
  const price = (position.entryPrice + position.margin / abs) / (1 + mmRate);
  return Number.isFinite(price) ? Math.ceil(price) : null;
}
