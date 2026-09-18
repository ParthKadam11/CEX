import { describe, expect, it } from "vitest";
import { buildSpotSwapOrder, isAppCommand } from "@cex/app-contracts";

const basePlace = {
  commandId: "command-1",
  type: "PLACE" as const,
  userId: "user-1",
  clientOrderId: "client-1",
  market: "SOL-USD" as const,
  side: "BUY" as const,
  orderType: "LIMIT" as const,
  timeInForce: "GTC" as const,
  price: 100,
  quantity: 1,
  timestamp: Date.now(),
};

describe("application command validation", () => {
  it("rejects unknown enums, unsafe units, IDs, and timestamps", () => {
    expect(isAppCommand(basePlace)).toBe(true);
    expect(
      isAppCommand({ ...basePlace, orderType: "UNKNOWN" }),
    ).toBe(false);
    expect(isAppCommand({ ...basePlace, quantity: 1.5 })).toBe(false);
    expect(isAppCommand({ ...basePlace, userId: "user id" })).toBe(false);
    expect(isAppCommand({ ...basePlace, timestamp: 1.5 })).toBe(false);
  });

  it("accepts SOL-USD-PERP places with leverage", () => {
    expect(
      isAppCommand({
        ...basePlace,
        market: "SOL-USD-PERP",
        leverage: 5,
      }),
    ).toBe(true);
    expect(
      isAppCommand({
        ...basePlace,
        market: "SOL-USD-PERP",
        orderType: "MARKET",
        price: 0,
        side: "SELL",
        quoteBudget: 500,
        leverage: 10,
      }),
    ).toBe(false);
    expect(
      isAppCommand({
        ...basePlace,
        market: "SOL-USD-PERP",
        leverage: 99,
      }),
    ).toBe(false);
  });

  it("accepts CREDIT with an optional market", () => {
    expect(
      isAppCommand({
        commandId: "c1",
        type: "CREDIT",
        userId: "user-1",
        asset: "USD",
        amount: 100,
        market: "SOL-USD-PERP",
        timestamp: Date.now(),
      }),
    ).toBe(true);
  });

  it("accepts DEBIT with an optional market", () => {
    expect(
      isAppCommand({
        commandId: "d1",
        type: "DEBIT",
        userId: "user-1",
        asset: "SOL",
        amount: 2,
        market: "SOL-USD",
        timestamp: Date.now(),
      }),
    ).toBe(true);
  });

  it("threads optional requestId and rejects bad ones", () => {
    expect(isAppCommand({ ...basePlace, requestId: "req-1" })).toBe(true);
    expect(isAppCommand({ ...basePlace, requestId: "bad id" })).toBe(false);
  });

  it("rejects MARKET and FOK_BUDGET places", () => {
    expect(
      isAppCommand({
        ...basePlace,
        orderType: "MARKET",
        timeInForce: "IOC",
        price: 0,
        quoteBudget: 100,
      }),
    ).toBe(false);
    expect(
      isAppCommand({
        ...basePlace,
        orderType: "MARKET",
        timeInForce: "FOK_BUDGET",
        price: 0,
        quoteBudget: 100,
      }),
    ).toBe(false);
    expect(
      isAppCommand({
        ...basePlace,
        timeInForce: "FOK_BUDGET",
        quoteBudget: 100,
      }),
    ).toBe(false);
  });
});

describe("spot swap mapping", () => {
  it("is disabled with limit-only desks", () => {
    expect(
      buildSpotSwapOrder({
        fromAsset: "USD",
        toAsset: "SOL",
        amount: 250,
        clientOrderId: "swap-1",
      }),
    ).toEqual({ error: "MARKET_ORDERS_DISABLED" });
    expect(
      buildSpotSwapOrder({
        fromAsset: "SOL",
        toAsset: "USD",
        amount: 3,
        clientOrderId: "swap-2",
        fillMode: "FOK",
      }),
    ).toEqual({ error: "MARKET_ORDERS_DISABLED" });
  });
});
