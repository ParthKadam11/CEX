import { describe, expect, it } from "vitest";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { lotsFromLamports } from "../src/scan.js";

describe("lotsFromLamports", () => {
  it("floors to whole SOL lots and respects min", () => {
    expect(lotsFromLamports(LAMPORTS_PER_SOL * 2 + 100, 1)).toBe(2);
    expect(lotsFromLamports(LAMPORTS_PER_SOL - 1, 1)).toBe(0);
    expect(lotsFromLamports(LAMPORTS_PER_SOL, 2)).toBe(0);
  });
});
