import type {
  AssetId,
  Balance,
  LedgerEntry,
  LedgerReason,
  LedgerRefType,
  Trade,
} from "@cex/exchange-types";
import { quoteNotional } from "../market/units.js";
import { BalanceStore } from "./balanceStore.js";
import { Ledger } from "./ledger.js";

export type BalanceRef = {
  refType: LedgerRefType;
  refId: string;
};

/*
  BalanceService = BalanceStore mutations + Ledger append in one place.

  Callers should go through here (not BalanceStore directly) so every
  money move leaves an audit row.
*/

export class BalanceService {
  constructor(
    private readonly store = new BalanceStore(),
    private readonly journal = new Ledger(),
  ) {}

  get balances(): BalanceStore {
    return this.store;
  }

  get ledger(): Ledger {
    return this.journal;
  }

  get(userId: string, asset: AssetId): Balance {
    return this.store.get(userId, asset);
  }

  getByUser(userId: string): Balance[] {
    return this.store.getByUser(userId);
  }

  // Deposit into available.
  credit(
    userId: string,
    asset: AssetId,
    amount: number,
    reason: LedgerReason = "DEPOSIT",
    ref?: BalanceRef,
  ): { balance: Balance; entry: LedgerEntry } {
    const before = this.store.get(userId, asset);
    const balance = this.store.credit(userId, asset, amount);
    const entry = this.write(userId, asset, before, balance, reason, ref);
    return { balance, entry };
  }

  // available → locked (place order).
  lock(
    userId: string,
    asset: AssetId,
    amount: number,
    ref?: BalanceRef,
  ): { balance: Balance; entry: LedgerEntry } {
    const before = this.store.get(userId, asset);
    const balance = this.store.lock(userId, asset, amount);
    const entry = this.write(userId, asset, before, balance, "LOCK_ORDER", ref);
    return { balance, entry };
  }

  // locked → available (cancel / unused remainder).
  unlock(
    userId: string,
    asset: AssetId,
    amount: number,
    ref?: BalanceRef,
  ): { balance: Balance; entry: LedgerEntry } {
    const before = this.store.get(userId, asset);
    const balance = this.store.unlock(userId, asset, amount);
    const entry = this.write(userId, asset, before, balance, "UNLOCK_ORDER", ref);
    return { balance, entry };
  }

  // Spend from locked on fill (buyer quote / seller base).
  debitLocked(
    userId: string,
    asset: AssetId,
    amount: number,
    ref?: BalanceRef,
  ): { balance: Balance; entry: LedgerEntry } {
    const before = this.store.get(userId, asset);
    const balance = this.store.debitLocked(userId, asset, amount);
    const entry = this.write(userId, asset, before, balance, "SETTLE_DEBIT", ref);
    return { balance, entry };
  }

  // Receive asset on fill into available.
  settleCredit(
    userId: string,
    asset: AssetId,
    amount: number,
    ref?: BalanceRef,
  ): { balance: Balance; entry: LedgerEntry } {
    return this.credit(userId, asset, amount, "SETTLE_CREDIT", ref);
  }

  //Apply realized perp PnL to available USD (profit credit / loss debit). 
  applyPnl(
    userId: string,
    amount: number,
    ref?: BalanceRef,
  ): { balance: Balance; entry: LedgerEntry } | null {
    if (amount === 0) return null;
    const asset: AssetId = "USD";
    const before = this.store.get(userId, asset);
    const balance =
      amount > 0
        ? this.store.credit(userId, asset, amount)
        : this.store.debitAvailable(userId, asset, -amount);
    const entry = this.write(userId, asset, before, balance, "PNL_SETTLE", ref);
    return { balance, entry };
  }

  /**
  Move funds for one trade (both sides).
  
  Buyer: spend quote from lock (release limit−trade price improvement), receive base.
   
  Seller: spend base from lock, receive quote.
   
  Returns how much reserved lock to release from each order's tracked lock.
   */
  settleTrade(args: {
    trade: Trade;
    buyLimitPrice: number;
    base: AssetId;
    quote: AssetId;
  }): { buyLockRelease: number; sellLockRelease: number } {
    const { trade, buyLimitPrice, base, quote } = args;
    const cost = quoteNotional(trade.price, trade.quantity);
    const reservedBuy = quoteNotional(buyLimitPrice, trade.quantity);
    const ref: BalanceRef = { refType: "TRADE", refId: trade.tradeId };

    this.debitLocked(trade.buyerUserId, quote, cost, ref);
    if (reservedBuy > cost) {
      this.unlock(trade.buyerUserId, quote, reservedBuy - cost, {
        refType: "ORDER",
        refId: trade.buyOrderId,
      });
    }
    this.settleCredit(trade.buyerUserId, base, trade.quantity, ref);

    this.debitLocked(trade.sellerUserId, base, trade.quantity, ref);
    this.settleCredit(trade.sellerUserId, quote, cost, ref);

    return {
      buyLockRelease: reservedBuy,
      sellLockRelease: trade.quantity,
    };
  }

  private write(
    userId: string,
    asset: AssetId,
    before: Balance,
    after: Balance,
    reason: LedgerReason,
    ref?: BalanceRef,
  ): LedgerEntry {
    return this.journal.append({
      userId,
      asset,
      availableDelta: after.available - before.available,
      lockedDelta: after.locked - before.locked,
      availableAfter: after.available,
      lockedAfter: after.locked,
      reason,
      refType: ref?.refType,
      refId: ref?.refId,
    });
  }
}
