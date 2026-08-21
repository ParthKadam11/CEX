import fs from "node:fs";
import path from "node:path";
import type {
  Balance,
  LedgerEntry,
  MarketSymbol,
  Order,
  OrderEvent,
} from "@cex/exchange-types";
import { atomicWriteFile } from "./atomicFile.js";

export const SNAPSHOT_VERSION = 1 as const;

export type EngineSnapshot = {
  version: typeof SNAPSHOT_VERSION;
  market: MarketSymbol;
  walSeq: number;
  tradeSeq: number;
  eventSeq: number;
  ledgerSeq: number;
  balances: Balance[];
  orders: Order[];
  events: OrderEvent[];
  ledger: LedgerEntry[];
};

export function snapshotPathFor(walPath: string): string {
  const dir = path.dirname(walPath);
  const base = path.basename(walPath, path.extname(walPath));
  return path.join(dir, `${base}.snapshot.json`);
}

export function saveSnapshot(filePath: string, snapshot: EngineSnapshot): void {
  atomicWriteFile(filePath, `${JSON.stringify(snapshot)}\n`);
}

export function loadSnapshot(filePath: string): EngineSnapshot | null {
  if (!fs.existsSync(filePath)) return null;
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as EngineSnapshot;
  if (parsed.version !== SNAPSHOT_VERSION) {
    throw new Error(`unsupported snapshot version ${String(parsed.version)}`);
  }
  return parsed;
}
