import { describe, expect, it } from "vitest";
import { CommandQueue } from "../../../src/market/commandQueue.js";

describe("CommandQueue", () => {
  it("runs queued jobs in order and fsyncs once per batch", async () => {
    let flushes = 0;
    const queue = new CommandQueue(async () => {
      flushes += 1;
    });
    const seen: number[] = [];

    const first = queue.enqueue(() => {
      seen.push(1);
      return "a";
    });
    const second = queue.enqueue(() => {
      seen.push(2);
      return "b";
    });

    await expect(Promise.all([first, second])).resolves.toEqual(["a", "b"]);
    expect(seen).toEqual([1, 2]);
    expect(flushes).toBe(1);
  });

  it("rejects a failed job without dropping the rest of the batch", async () => {
    const queue = new CommandQueue(async () => undefined);
    const ok = queue.enqueue(() => 1);
    const bad = queue.enqueue(() => {
      throw new Error("boom");
    });
    const later = queue.enqueue(() => 2);

    await expect(ok).resolves.toBe(1);
    await expect(bad).rejects.toThrow("boom");
    await expect(later).resolves.toBe(2);
  });
});
