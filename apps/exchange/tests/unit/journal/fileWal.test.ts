import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FileWal } from "../../../src/journal/fileWal.js";

function tempWalPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cex-wal-"));
  return path.join(dir, "SOL-USD.jsonl");
}

describe("FileWal", () => {
  it("appends JSON lines with growing seq and survives a new instance", async () => {
    const file = tempWalPath();
    const wal = new FileWal(file);
    wal.append({
      type: "CREDIT",
      userId: "u1",
      asset: "USD",
      amount: 100,
      timestamp: 1,
    });
    wal.append({
      type: "CANCEL",
      orderId: "b1",
      timestamp: 2,
    });
    await wal.flush();
    wal.close();

    const again = new FileWal(file);
    const all = again.readAll();
    expect(all.map((c) => c.type)).toEqual(["CREDIT", "CANCEL"]);
    expect(all[0]?.seq).toBe(1);
    expect(all[1]?.seq).toBe(2);

    again.append({
      type: "CANCEL",
      orderId: "b2",
      timestamp: 3,
    });
    await again.flush();
    expect(again.readAll()[2]?.seq).toBe(3);
    again.close();
  });

  it("readAfter and truncateAfter keep only the tail", async () => {
    const file = tempWalPath();
    const wal = new FileWal(file);
    wal.append({
      type: "CREDIT",
      userId: "u1",
      asset: "USD",
      amount: 1,
      timestamp: 1,
    });
    wal.append({
      type: "CREDIT",
      userId: "u1",
      asset: "USD",
      amount: 2,
      timestamp: 2,
    });
    wal.append({
      type: "CANCEL",
      orderId: "b1",
      timestamp: 3,
    });

    expect(wal.readAfter(1).map((c) => c.seq)).toEqual([2, 3]);

    wal.truncateAfter(2);
    expect(wal.currentSeq).toBe(3);
    expect(wal.readAll().map((c) => c.seq)).toEqual([3]);

    wal.append({
      type: "CANCEL",
      orderId: "b2",
      timestamp: 4,
    });
    await wal.flush();
    expect(wal.readAll().map((c) => c.seq)).toEqual([3, 4]);
    wal.close();
  });

  it("group-commits many appends with one flush", async () => {
    const file = tempWalPath();
    const wal = new FileWal(file);
    for (let i = 0; i < 20; i++) {
      wal.append({
        type: "CREDIT",
        userId: "u1",
        asset: "USD",
        amount: 1,
        timestamp: i,
      });
    }
    await wal.flush();
    expect(wal.readAll()).toHaveLength(20);
    wal.close();
  });

  it("recovers a truncated tail and keeps a quarantine backup", () => {
    const file = tempWalPath();
    fs.writeFileSync(
      file,
      `${JSON.stringify({ type: "CREDIT", seq: 1 })}\n{"type":"PLACE","seq":`,
      "utf8",
    );

    const wal = new FileWal(file);

    expect(wal.readAll().map((command) => command.seq)).toEqual([1]);
    expect(
      fs
        .readdirSync(path.dirname(file))
        .some((name) => name.startsWith("SOL-USD.jsonl.corrupt-")),
    ).toBe(true);
    expect(wal.currentSeq).toBe(1);
    wal.close();
  });
});
