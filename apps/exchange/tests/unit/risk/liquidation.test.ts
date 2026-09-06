import { describe, expect, it } from "vitest";
import type { Position } from "@cex/exchange-types";
import {
  approximateLiquidationPrice,
  buildLiquidationClose,
  enrichPositionRisk,
  isLiquidatable,
  maintenanceRequirement,
  positionEquity,
  unrealizedPnl,
} from "../../../src/risk/liquidation.js";
import { Side } from "@cex/exchange-types";

function pos(partial: Partial<Position> & Pick<Position, "size">): Position {
  return {
    userId: "u1",
    market: "SOL-USD-PERP",
    entryPrice: 100,
    margin: 20,
    leverage: 5,
    updatedAt: 1,
    ...partial,
  };
}

describe("liquidation math", () => {
  it("computes uPnL / equity / maintenance for long and short", () => {
    expect(unrealizedPnl(2, 100, 90)).toBe(-20);
    expect(unrealizedPnl(-2, 100, 110)).toBe(-20);
    expect(positionEquity(20, 2, 100, 90)).toBe(0);
    expect(maintenanceRequirement(2, 90, 50)).toBe(Math.ceil((180 * 50) / 10_000));
  });

  it("flags long underwater when equity < maintenance", () => {
    const long = pos({ size: 1, entryPrice: 100, margin: 20 });
    expect(isLiquidatable(long, 70, 50)).toBe(true);
    expect(isLiquidatable(long, 100, 50)).toBe(false);
  });

  it("flags short underwater when equity < maintenance", () => {
    const short = pos({ size: -1, entryPrice: 100, margin: 20 });
    expect(isLiquidatable(short, 130, 50)).toBe(true);
    expect(isLiquidatable(short, 100, 50)).toBe(false);
  });

  it("skips flat / unknown mark", () => {
    expect(isLiquidatable(pos({ size: 0 }), 100, 50)).toBe(false);
    expect(isLiquidatable(pos({ size: 1 }), null, 50)).toBe(false);
  });

  it("builds close side at mark", () => {
    expect(buildLiquidationClose(pos({ size: 3 }), 88)).toEqual({
      side: Side.SELL,
      quantity: 3,
      price: 88,
    });
    expect(buildLiquidationClose(pos({ size: -2 }), 120)).toEqual({
      side: Side.BUY,
      quantity: 2,
      price: 120,
    });
  });

  it("approximates liquidation price", () => {
    const long = pos({ size: 1, entryPrice: 100, margin: 20 });
    const liq = approximateLiquidationPrice(long, 50);
    expect(liq).not.toBeNull();
    expect(liq!).toBeLessThan(100);

    const short = pos({ size: -1, entryPrice: 100, margin: 20 });
    const shortLiq = approximateLiquidationPrice(short, 50);
    expect(shortLiq).not.toBeNull();
    expect(shortLiq!).toBeGreaterThan(100);
  });

  it("enriches position risk view", () => {
    const view = enrichPositionRisk(
      pos({ size: 1, entryPrice: 100, margin: 20 }),
      70,
      50,
    );
    expect(view.equity).toBe(-10);
    expect(view.liquidatable).toBe(true);
    expect(view.unrealizedPnl).toBe(-30);
    expect(view.liquidationPrice).not.toBeNull();
  });
});
