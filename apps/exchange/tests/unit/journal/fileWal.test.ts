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
  it("appends JSON lines with growing seq and survives a new instance", () => {
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
    expect(again.readAll()[2]?.seq).toBe(3);
  });
});
