import type { LedgerEntry } from "@cex/exchange-types";

//Ledger is append-only balance journal (source of truth for money moves).

type NewEntry = Omit<LedgerEntry, "seq" | "timestamp"> & {
  timestamp?: number;
};

export class Ledger {
  private entries: LedgerEntry[] = [];
  private seq = 0;

  append(entry: NewEntry): LedgerEntry {
    this.seq += 1;
    const full: LedgerEntry = {
      ...entry,
      seq: this.seq,
      timestamp: entry.timestamp ?? Date.now(),
    };
    this.entries.push(full);
    return full;
  }

  get currentSeq(): number {
    return this.seq;
  }

  replace(entries: readonly LedgerEntry[], seq: number): void {
    this.entries = [...entries];
    this.seq = seq;
  }

  trimNewest(max: number): void {
    if (max < 0 || this.entries.length <= max) return;
    this.entries = this.entries.slice(this.entries.length - max);
  }

  all(): readonly LedgerEntry[] {
    return this.entries;
  }

  forUser(userId: string): LedgerEntry[] {
    return this.entries.filter((e) => e.userId === userId);
  }

  forUserAsset(userId: string, asset: LedgerEntry["asset"]): LedgerEntry[] {
    return this.entries.filter((e) => e.userId === userId && e.asset === asset);
  }

  forRef(refType: NonNullable<LedgerEntry["refType"]>, refId: string): LedgerEntry[] {
    return this.entries.filter((e) => e.refType === refType && e.refId === refId);
  }

  // Replay deltas → reconstruct available / locked (ignores BalanceStore).
  replay(userId: string, asset: LedgerEntry["asset"]): {
    available: number;
    locked: number;
  } {
    let available = 0;
    let locked = 0;
    for (const e of this.forUserAsset(userId, asset)) {
      available += e.availableDelta;
      locked += e.lockedDelta;
    }
    return { available, locked };
  }

  clear(): void {
    this.entries = [];
    this.seq = 0;
  }
}
