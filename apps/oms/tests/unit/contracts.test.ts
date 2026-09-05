import { describe, expect, it } from "vitest";
import { MAX_ORDER_QUANTITY } from "@cex/exchange-types";
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
    ).toBe(true);
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

  it("only accepts FOK_BUDGET for market buys with a budget", () => {
    expect(
      isAppCommand({
        ...basePlace,
        orderType: "MARKET",
        timeInForce: "FOK_BUDGET",
        price: 0,
        quoteBudget: 100,
      }),
    ).toBe(true);
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
  it("maps USD→SOL to a market buy with quoteBudget", () => {
    const order = buildSpotSwapOrder({
      fromAsset: "USD",
      toAsset: "SOL",
      amount: 250,
      clientOrderId: "swap-1",
    });
    expect(order).toEqual({
      clientOrderId: "swap-1",
      market: "SOL-USD",
      side: "BUY",
      orderType: "MARKET",
      timeInForce: "IOC",
      price: 0,
      quantity: MAX_ORDER_QUANTITY,
      quoteBudget: 250,
    });
    expect(
      isAppCommand({
        ...(order as object),
        commandId: "command-1",
        type: "PLACE",
        userId: "user-1",
        timestamp: Date.now(),
      }),
    ).toBe(true);
  });

  it("maps SOL→USD to a market sell", () => {
    expect(
      buildSpotSwapOrder({
        fromAsset: "SOL",
        toAsset: "USD",
        amount: 3,
        clientOrderId: "swap-2",
        fillMode: "FOK",
      }),
    ).toEqual({
      clientOrderId: "swap-2",
      market: "SOL-USD",
      side: "SELL",
      orderType: "MARKET",
      timeInForce: "FOK",
      price: 0,
      quantity: 3,
    });
  });

  it("rejects invalid pairs and FOK on USD spends", () => {
    expect(
      buildSpotSwapOrder({
        fromAsset: "USD",
        toAsset: "USD",
        amount: 1,
        clientOrderId: "swap-3",
      }),
    ).toEqual({ error: "INVALID_SWAP_PAIR" });
    expect(
      buildSpotSwapOrder({
        fromAsset: "USD",
        toAsset: "SOL",
        amount: 1,
        clientOrderId: "swap-4",
        fillMode: "FOK",
      }),
    ).toEqual({ error: "FOK_REQUIRES_SOL_SELL" });
  });
});
