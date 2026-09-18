import fs from "node:fs";
import path from "node:path";
import type { Balance, LedgerEntry } from "@cex/exchange-types";
import { BalanceService } from "./balanceService.js";
import { CommandQueue } from "../market/commandQueue.js";

/**
Process-wide paper wallet shared by every hosted market (spot + perps).
Markets keep separate books / WALs / positions, but CREDIT, locks, margin and PnL all mutate this one BalanceService so Home / Spot / Perps show the same available + locked numbers.
*/
export type WalletSnapshot = {
  version: 1;
  ledgerSeq: number;
  balances: Balance[];
  ledger: LedgerEntry[];
  savedAt: number;
};

export class SharedWallet {
  readonly money = new BalanceService();
  private readonly flushHooks: Array<() => Promise<void>> = [];
  private readonly queue: CommandQueue;
  private readonly snapshotPath: string | null;

  constructor(snapshotPath?: string | null) {
    this.snapshotPath = snapshotPath ?? null;
    this.queue = new CommandQueue(async () => {
      await Promise.all(this.flushHooks.map((hook) => hook()));
      this.save();
    });
  }

  registerFlush(hook: () => Promise<void>): void {
    this.flushHooks.push(hook);
  }

  enqueue<T>(run: () => T): Promise<T> {
    return this.queue.enqueue(run);
  }

  load(): void {
    if (!this.snapshotPath || !fs.existsSync(this.snapshotPath)) return;
    const raw = fs.readFileSync(this.snapshotPath, "utf8");
    const snapshot = JSON.parse(raw) as WalletSnapshot;
    if (snapshot.version !== 1) return;
    this.money.balances.loadAll(snapshot.balances ?? []);
    this.money.ledger.replace(snapshot.ledger ?? [], snapshot.ledgerSeq ?? 0);
  }

  save(): void {
    if (!this.snapshotPath) return;
    const dir = path.dirname(this.snapshotPath);
    fs.mkdirSync(dir, { recursive: true });
    const snapshot: WalletSnapshot = {
      version: 1,
      ledgerSeq: this.money.ledger.currentSeq,
      balances: this.money.balances.listAll(),
      ledger: [...this.money.ledger.all()],
      savedAt: Date.now(),
    };
    const tmp = `${this.snapshotPath}.tmp`;
    fs.writeFileSync(tmp, `${JSON.stringify(snapshot)}\n`, "utf8");
    fs.renameSync(tmp, this.snapshotPath);
  }

  clear(): void {
    this.money.balances.loadAll([]);
    this.money.ledger.replace([], 0);
    if (this.snapshotPath && fs.existsSync(this.snapshotPath)) {
      fs.rmSync(this.snapshotPath, { force: true });
    }
  }
}
