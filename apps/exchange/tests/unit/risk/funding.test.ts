import { describe, expect, it } from "vitest";
import {
  fundingBalanceDelta,
  fundingCharge,
} from "../../../src/risk/funding.js";

describe("funding math", () => {
  it("longs pay shorts when rate is positive", () => {
    // size 1, mark 100, 100 bps → trunc(10000/10000) = 1
    expect(fundingCharge(1, 100, 100)).toBe(1);
    expect(fundingCharge(-1, 100, 100)).toBe(-1);
    expect(fundingCharge(10, 100, 100)).toBe(10);
    expect(fundingBalanceDelta(1)).toBe(-1);
    expect(fundingBalanceDelta(-1)).toBe(1);
  });

  it("truncates sub-tick charges to zero", () => {
    // 1 bps on 100 notional → 0.01 → trunc 0
    expect(fundingCharge(1, 100, 1)).toBe(0);
  });

  it("skips zero size / mark / rate", () => {
    expect(fundingCharge(0, 100, 100)).toBe(0);
    expect(fundingCharge(10, 0, 100)).toBe(0);
    expect(fundingCharge(10, 100, 0)).toBe(0);
  });
});
