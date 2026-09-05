import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  loadSnapshot,
  saveSnapshot,
  snapshotPathFor,
  type EngineSnapshot,
} from "../../../src/journal/snapshot.js";

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "cex-snap-"));
}

describe("engine snapshot file", () => {
  it("derives snapshot path from the WAL path", () => {
    expect(snapshotPathFor(path.join("data", "SOL-USD.jsonl"))).toBe(
      path.join("data", "SOL-USD.snapshot.json"),
    );
  });

  it("round-trips and returns null when missing", () => {
    const dir = tempDir();
    const file = path.join(dir, "SOL-USD.snapshot.json");
    expect(loadSnapshot(file)).toBeNull();

    const snapshot: EngineSnapshot = {
      version: 2,
      market: "SOL-USD",
      walSeq: 4,
      tradeSeq: 1,
      eventSeq: 2,
      ledgerSeq: 3,
      balances: [
        { userId: "u1", asset: "USD", available: 10, locked: 0 },
      ],
      orders: [],
      events: [],
      ledger: [],
      positions: [],
    };
    saveSnapshot(file, snapshot);
    expect(loadSnapshot(file)).toEqual(snapshot);
  });
});
