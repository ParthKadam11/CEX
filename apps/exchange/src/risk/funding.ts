import type { Position } from "@cex/exchange-types";

// Signed funding charge in USD ticks.
// rateBps > 0 → longs pay shorts: charge = trunc(size * mark * rateBps / 10_000).
// Apply to balance as applyPnl(user, -charge).
export function fundingCharge(
  size: number,
  mark: number,
  fundingRateBps: number,
): number {
  if (size === 0 || mark <= 0 || fundingRateBps === 0) return 0;
  return Math.trunc((size * mark * fundingRateBps) / 10_000);
}

export function fundingPaymentForPosition(
  position: Position,
  mark: number,
  fundingRateBps: number,
): number {
  return fundingCharge(position.size, mark, fundingRateBps);
}

// Balance delta for the user (positive = credit available).
export function fundingBalanceDelta(charge: number): number {
  return -charge;
}
