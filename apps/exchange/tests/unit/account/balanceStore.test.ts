import { describe, expect, it } from "vitest";
import {
  BalanceStore,
  InsufficientBalanceError,
} from "../../../src/account/balanceStore.js";

describe("BalanceStore", () => {
  it("starts at zero and credits into available", () => {
    const store = new BalanceStore();

    expect(store.get("u1", "USD")).toEqual({
      userId: "u1",
      asset: "USD",
      available: 0,
      locked: 0,
    });

    expect(store.credit("u1", "USD", 1000)).toEqual({
      userId: "u1",
      asset: "USD",
      available: 1000,
      locked: 0,
    });
    expect(store.get("u1", "USD").available).toBe(1000);
  });

  it("lock moves available → locked; unlock reverses", () => {
    const store = new BalanceStore();
    store.credit("u1", "USD", 1000);

    expect(store.lock("u1", "USD", 200)).toEqual({
      userId: "u1",
      asset: "USD",
      available: 800,
      locked: 200,
    });

    expect(store.unlock("u1", "USD", 50)).toEqual({
      userId: "u1",
      asset: "USD",
      available: 850,
      locked: 150,
    });
  });

  it("debitLocked spends locked without returning to available", () => {
    const store = new BalanceStore();
    store.credit("u1", "USD", 500);
    store.lock("u1", "USD", 200);

    expect(store.debitLocked("u1", "USD", 100)).toEqual({
      userId: "u1",
      asset: "USD",
      available: 300,
      locked: 100,
    });
  });

  it("throws when locking more than available", () => {
    const store = new BalanceStore();
    store.credit("u1", "USD", 100);

    expect(() => store.lock("u1", "USD", 150)).toThrow(InsufficientBalanceError);
    expect(store.get("u1", "USD")).toEqual({
      userId: "u1",
      asset: "USD",
      available: 100,
      locked: 0,
    });
  });

  it("throws when unlocking / debiting more than locked", () => {
    const store = new BalanceStore();
    store.credit("u1", "SOL", 10);
    store.lock("u1", "SOL", 3);

    expect(() => store.unlock("u1", "SOL", 5)).toThrow(InsufficientBalanceError);
    expect(() => store.debitLocked("u1", "SOL", 5)).toThrow(
      InsufficientBalanceError,
    );
  });

  it("rejects non-positive amounts", () => {
    const store = new BalanceStore();
    expect(() => store.credit("u1", "USD", 0)).toThrow(/positive safe integer/);
    expect(() => store.lock("u1", "USD", -1)).toThrow(/positive safe integer/);
    expect(() => store.credit("u1", "USD", 0.1)).toThrow(/positive safe integer/);
  });

  it("lists balances for a user across assets", () => {
    const store = new BalanceStore();
    store.credit("u1", "USD", 100);
    store.credit("u1", "SOL", 5);
    store.credit("u2", "USD", 50);

    expect(store.getByUser("u1")).toEqual([
      { userId: "u1", asset: "USD", available: 100, locked: 0 },
      { userId: "u1", asset: "SOL", available: 5, locked: 0 },
    ]);
  });
});
