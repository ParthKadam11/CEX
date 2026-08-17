import type { AssetId, Balance } from "@cex/exchange-types";

/*
  BalanceStore is locked balances per user + asset.

  available = free to spend / withdraw
  locked    = reserved for open orders
  total     = derived: available + locked (not stored)

  methods:
  credit(user, asset, amount)  — deposit into available
  lock(user, asset, amount)    — available → locked (on place)
  unlock(user, asset, amount)  — locked → available (on cancel / leftover)
  debitLocked(user, asset, amount) — spend from locked (on fill settlement)
*/

export class InsufficientBalanceError extends Error {
  constructor(
    readonly userId: string,
    readonly asset: AssetId,
    readonly need: number,
    readonly have: number,
    readonly field: "available" | "locked",
  ) {
    super(
      `Insufficient ${field} ${asset} for ${userId}: need ${need}, have ${have}`,
    );
    this.name = "InsufficientBalanceError";
  }
}

function key(userId: string, asset: AssetId): string {
  return `${userId}:${asset}`;
}

export class BalanceStore {
  private readonly balances = new Map<string, Balance>();

  get(userId: string, asset: AssetId): Balance {
    return (
      this.balances.get(key(userId, asset)) ?? {
        userId,
        asset,
        available: 0,
        locked: 0,
      }
    );
  }

  getByUser(userId: string): Balance[] {
    const out: Balance[] = [];
    for (const bal of this.balances.values()) {
      if (bal.userId === userId) out.push({ ...bal });
    }
    return out;
  }

  // Deposit / credit into available.
  credit(userId: string, asset: AssetId, amount: number): Balance {
    this.assertPositive(amount);
    const bal = this.ensure(userId, asset);
    bal.available += amount;
    return { ...bal };
  }

  // Reserve funds for an open order: available → locked.
  lock(userId: string, asset: AssetId, amount: number): Balance {
    this.assertPositive(amount);
    const bal = this.ensure(userId, asset);
    if (bal.available < amount) {
      throw new InsufficientBalanceError(
        userId,
        asset,
        amount,
        bal.available,
        "available",
      );
    }
    bal.available -= amount;
    bal.locked += amount;
    return { ...bal };
  }

  // Release unused reservation: locked → available.
  unlock(userId: string, asset: AssetId, amount: number): Balance {
    this.assertPositive(amount);
    const bal = this.ensure(userId, asset);
    if (bal.locked < amount) {
      throw new InsufficientBalanceError(
        userId,
        asset,
        amount,
        bal.locked,
        "locked",
      );
    }
    bal.locked -= amount;
    bal.available += amount;
    return { ...bal };
  }

  // Consume locked funds on fill (quote paid / base sold).
  debitLocked(userId: string, asset: AssetId, amount: number): Balance {
    this.assertPositive(amount);
    const bal = this.ensure(userId, asset);
    if (bal.locked < amount) {
      throw new InsufficientBalanceError(
        userId,
        asset,
        amount,
        bal.locked,
        "locked",
      );
    }
    bal.locked -= amount;
    return { ...bal };
  }

  clear(): void {
    this.balances.clear();
  }

  private ensure(userId: string, asset: AssetId): Balance {
    const k = key(userId, asset);
    let bal = this.balances.get(k);
    if (!bal) {
      bal = { userId, asset, available: 0, locked: 0 };
      this.balances.set(k, bal);
    }
    return bal;
  }

  private assertPositive(amount: number): void {
    if (!(amount > 0)) {
      throw new Error(`amount must be > 0, got ${amount}`);
    }
  }
}
