import { describe, expect, it } from "vitest";
import { isAppCommand } from "@cex/app-contracts";

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
