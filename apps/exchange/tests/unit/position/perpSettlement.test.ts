import { describe, expect, it } from "vitest";
import { Side } from "@cex/exchange-types";
import { applyPerpFill } from "../../../src/position/perpSettlement.js";

describe("applyPerpFill", () => {
  const empty = {
    userId: "u1",
    market: "SOL-USD-PERP" as const,
    size: 0,
    entryPrice: 0,
    margin: 0,
    leverage: 1,
    updatedAt: 0,
  };

  it("opens a long", () => {
    const result = applyPerpFill({
      position: empty,
      side: Side.BUY,
      quantity: 2,
      price: 100,
      leverage: 5,
      marginIn: 40,
      timestamp: 1,
    });
    expect(result.position.size).toBe(2);
    expect(result.position.entryPrice).toBe(100);
    expect(result.position.margin).toBe(40);
    expect(result.realizedPnl).toBe(0);
    expect(result.marginUnlocked).toBe(0);
  });

  it("increases a long with VWAP entry", () => {
    const open = applyPerpFill({
      position: empty,
      side: Side.BUY,
      quantity: 2,
      price: 100,
      leverage: 1,
      marginIn: 200,
      timestamp: 1,
    }).position;

    const result = applyPerpFill({
      position: open,
      side: Side.BUY,
      quantity: 2,
      price: 120,
      leverage: 1,
      marginIn: 240,
      timestamp: 2,
    });
    expect(result.position.size).toBe(4);
    expect(result.position.entryPrice).toBe(110);
    expect(result.position.margin).toBe(440);
    expect(result.realizedPnl).toBe(0);
  });

  it("reduces a long and realizes PnL", () => {
    const open = applyPerpFill({
      position: empty,
      side: Side.BUY,
      quantity: 4,
      price: 100,
      leverage: 1,
      marginIn: 400,
      timestamp: 1,
    }).position;

    const result = applyPerpFill({
      position: open,
      side: Side.SELL,
      quantity: 1,
      price: 110,
      leverage: 1,
      marginIn: 110,
      timestamp: 2,
    });
    expect(result.position.size).toBe(3);
    expect(result.realizedPnl).toBe(10);
    expect(result.position.margin).toBe(300);
    expect(result.marginUnlocked).toBe(100 + 110);
  });

  it("closes flat and unlocks residual margin", () => {
    const open = applyPerpFill({
      position: empty,
      side: Side.SELL,
      quantity: 2,
      price: 100,
      leverage: 2,
      marginIn: 100,
      timestamp: 1,
    }).position;

    const result = applyPerpFill({
      position: open,
      side: Side.BUY,
      quantity: 2,
      price: 90,
      leverage: 2,
      marginIn: 90,
      timestamp: 2,
    });
    expect(result.position.size).toBe(0);
    expect(result.position.margin).toBe(0);
    // short entry 100, cover 90 → +10 * 2
    expect(result.realizedPnl).toBe(20);
    expect(result.marginUnlocked).toBe(100 + 90);
  });
});
