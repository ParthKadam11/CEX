import { describe, expect, it } from "vitest";
import { Ledger } from "../../../src/account/ledger.js";
import { BalanceService } from "../../../src/account/balanceService.js";

describe("Ledger", () => {
  it("appends with growing seq and filters by user / asset / ref", () => {
    const ledger = new Ledger();

    ledger.append({
      userId: "u1",
      asset: "USD",
      availableDelta: 1000,
      lockedDelta: 0,
      availableAfter: 1000,
      lockedAfter: 0,
      reason: "DEPOSIT",
      refType: "DEPOSIT",
      refId: "d1",
    });
    ledger.append({
      userId: "u1",
      asset: "USD",
      availableDelta: -200,
      lockedDelta: 200,
      availableAfter: 800,
      lockedAfter: 200,
      reason: "LOCK_ORDER",
      refType: "ORDER",
      refId: "b1",
    });
    ledger.append({
      userId: "u2",
      asset: "SOL",
      availableDelta: 5,
      lockedDelta: 0,
      availableAfter: 5,
      lockedAfter: 0,
      reason: "DEPOSIT",
    });

    expect(ledger.all()).toHaveLength(3);
    expect(ledger.all()[0]?.seq).toBe(1);
    expect(ledger.all()[2]?.seq).toBe(3);
    expect(ledger.forUser("u1")).toHaveLength(2);
    expect(ledger.forUserAsset("u1", "USD").map((e) => e.reason)).toEqual([
      "DEPOSIT",
      "LOCK_ORDER",
    ]);
    expect(ledger.forRef("ORDER", "b1")).toHaveLength(1);
  });

  it("replay reconstructs available / locked from deltas", () => {
    const ledger = new Ledger();
    ledger.append({
      userId: "u1",
      asset: "USD",
      availableDelta: 1000,
      lockedDelta: 0,
      availableAfter: 1000,
      lockedAfter: 0,
      reason: "DEPOSIT",
    });
    ledger.append({
      userId: "u1",
      asset: "USD",
      availableDelta: -200,
      lockedDelta: 200,
      availableAfter: 800,
      lockedAfter: 200,
      reason: "LOCK_ORDER",
    });
    ledger.append({
      userId: "u1",
      asset: "USD",
      availableDelta: 0,
      lockedDelta: -100,
      availableAfter: 800,
      lockedAfter: 100,
      reason: "SETTLE_DEBIT",
    });

    expect(ledger.replay("u1", "USD")).toEqual({ available: 800, locked: 100 });
  });

  it("trimNewest keeps the latest entries and seq", () => {
    const ledger = new Ledger();
    ledger.append({
      userId: "u1",
      asset: "USD",
      availableDelta: 1,
      lockedDelta: 0,
      availableAfter: 1,
      lockedAfter: 0,
      reason: "DEPOSIT",
    });
    ledger.append({
      userId: "u1",
      asset: "USD",
      availableDelta: 2,
      lockedDelta: 0,
      availableAfter: 3,
      lockedAfter: 0,
      reason: "DEPOSIT",
    });
    ledger.append({
      userId: "u1",
      asset: "USD",
      availableDelta: 3,
      lockedDelta: 0,
      availableAfter: 6,
      lockedAfter: 0,
      reason: "DEPOSIT",
    });
    ledger.trimNewest(1);
    expect(ledger.all()).toHaveLength(1);
    expect(ledger.all()[0]?.availableDelta).toBe(3);
    expect(ledger.currentSeq).toBe(3);
  });
});

describe("BalanceService", () => {
  it("credit / lock / unlock / settle write ledger and keep store in sync", () => {
    const svc = new BalanceService();
    const orderRef = { refType: "ORDER" as const, refId: "b1" };
    const tradeRef = { refType: "TRADE" as const, refId: "t1" };

    svc.credit("u1", "USD", 1000, "DEPOSIT", {
      refType: "DEPOSIT",
      refId: "d1",
    });
    svc.lock("u1", "USD", 200, orderRef);
    svc.debitLocked("u1", "USD", 100, tradeRef);
    svc.settleCredit("u1", "SOL", 1, tradeRef);
    svc.unlock("u1", "USD", 100, orderRef);

    expect(svc.get("u1", "USD")).toEqual({
      userId: "u1",
      asset: "USD",
      available: 900,
      locked: 0,
    });
    expect(svc.get("u1", "SOL").available).toBe(1);

    const reasons = svc.ledger.forUser("u1").map((e) => e.reason);
    expect(reasons).toEqual([
      "DEPOSIT",
      "LOCK_ORDER",
      "SETTLE_DEBIT",
      "SETTLE_CREDIT",
      "UNLOCK_ORDER",
    ]);

    // ledger replay matches live store
    expect(svc.ledger.replay("u1", "USD")).toEqual({
      available: 900,
      locked: 0,
    });
    expect(svc.ledger.replay("u1", "SOL")).toEqual({
      available: 1,
      locked: 0,
    });
  });

  it("does not append when lock fails", () => {
    const svc = new BalanceService();
    svc.credit("u1", "USD", 50);

    expect(() => svc.lock("u1", "USD", 100)).toThrow();
    expect(svc.ledger.all()).toHaveLength(1); // only the deposit
    expect(svc.get("u1", "USD")).toEqual({
      userId: "u1",
      asset: "USD",
      available: 50,
      locked: 0,
    });
  });
});
