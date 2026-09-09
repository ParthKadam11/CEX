import { describe, expect, it } from "vitest";
import { DepositStatus } from "@cex/db";
import { depositCreditCommandId } from "@cex/solana";
import { shouldSkipDepositCredit } from "./idempotency.js";

describe("deposit credit idempotency", () => {
  it("binds one commandId per on-chain signature", () => {
    expect(depositCreditCommandId("abc123")).toBe("deposit:abc123");
  });

  it("skips credit when already CREDITED or IGNORED", () => {
    expect(shouldSkipDepositCredit(DepositStatus.CREDITED)).toBe(true);
    expect(shouldSkipDepositCredit(DepositStatus.IGNORED)).toBe(true);
    expect(shouldSkipDepositCredit(DepositStatus.SEEN)).toBe(false);
    expect(shouldSkipDepositCredit(DepositStatus.CREDITING)).toBe(false);
    expect(shouldSkipDepositCredit(DepositStatus.FAILED)).toBe(false);
  });
});
