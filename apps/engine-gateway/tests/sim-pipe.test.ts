import { describe, expect, it } from "vitest";
import { isStaleSimCommand } from "../src/commands/simPipe.js";

describe("isStaleSimCommand", () => {
  const now = 1_790_190_000_000;

  it("drops sim commands that have been waiting", () => {
    expect(isStaleSimCommand(`${now - 5_000}-0`, "sim-mm-bid", now)).toBe(true);
  });

  it("keeps a sim command that was just written", () => {
    expect(isStaleSimCommand(`${now - 200}-1`, "sim-trader-alice", now)).toBe(
      false,
    );
  });

  it("never drops a real user command, even when the pipe is behind", () => {
    expect(
      isStaleSimCommand(
        `${now - 60_000}-0`,
        "8f82f54e-753c-4be5-bbf2-f74b46081c86",
        now,
      ),
    ).toBe(false);
  });
});
