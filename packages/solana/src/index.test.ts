import { describe, expect, it, afterEach } from "vitest";
import {
  decryptSecretKey,
  encryptSecretKey,
  createKeypair,
  lamportsToLots,
  lotsToLamports,
  LAMPORTS_PER_LOT,
  explorerCluster,
  explorerTxUrl,
  explorerAddressUrl,
  assertDevnetOnly,
  depositCreditCommandId,
  withdrawDebitCommandId,
  withdrawRefundCommandId,
  withdrawAlreadySent,
  withdrawNeedsChainSend,
} from "../src/index.js";

describe("@cex/solana wallet primitives", () => {
  const prevRpc = process.env.SOLANA_RPC_URL;
  const prevPublicRpc = process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
  const prevAllow = process.env.SOLANA_ALLOW_NON_DEVNET;

  afterEach(() => {
    if (prevRpc === undefined) delete process.env.SOLANA_RPC_URL;
    else process.env.SOLANA_RPC_URL = prevRpc;
    if (prevPublicRpc === undefined) delete process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
    else process.env.NEXT_PUBLIC_SOLANA_RPC_URL = prevPublicRpc;
    if (prevAllow === undefined) delete process.env.SOLANA_ALLOW_NON_DEVNET;
    else process.env.SOLANA_ALLOW_NON_DEVNET = prevAllow;
  });

  it("round-trips encrypted secret keys", () => {
    process.env.SOLANA_WALLET_MASTER_KEY = "a".repeat(64);
    const { secretKey, publicKey } = createKeypair();
    expect(publicKey.length).toBeGreaterThan(30);
    const encrypted = encryptSecretKey(secretKey);
    expect(encrypted.startsWith("v1:")).toBe(true);
    const restored = decryptSecretKey(encrypted);
    expect(Buffer.from(restored)).toEqual(Buffer.from(secretKey));
  });

  it("converts lamports and lots with 1 lot = 1 SOL", () => {
    expect(lamportsToLots(LAMPORTS_PER_LOT * 2 + 100)).toBe(2);
    expect(lotsToLamports(3)).toBe(LAMPORTS_PER_LOT * 3);
  });

  it("builds explorer URLs for devnet", () => {
    expect(explorerCluster("https://api.devnet.solana.com")).toBe("devnet");
    expect(explorerTxUrl("sig123", "devnet")).toContain("cluster=devnet");
    expect(explorerAddressUrl("Addr", "devnet")).toContain("address/Addr");
  });

  it("rejects mainnet RPC URLs", () => {
    expect(() =>
      assertDevnetOnly("https://api.mainnet-beta.solana.com"),
    ).toThrow(/SOLANA_MAINNET_FORBIDDEN/);
  });

  it("allows testnet only with SOLANA_ALLOW_NON_DEVNET", () => {
    delete process.env.SOLANA_ALLOW_NON_DEVNET;
    expect(() => assertDevnetOnly("https://api.testnet.solana.com")).toThrow(
      /SOLANA_DEVNET_REQUIRED/,
    );
    process.env.SOLANA_ALLOW_NON_DEVNET = "true";
    expect(() =>
      assertDevnetOnly("https://api.testnet.solana.com"),
    ).not.toThrow();
  });

  it("uses stable deposit/withdraw command ids", () => {
    expect(depositCreditCommandId("sigABC")).toBe("deposit:sigABC");
    expect(withdrawDebitCommandId("w1")).toBe("withdraw:w1");
    expect(withdrawRefundCommandId("w1")).toBe("withdraw-refund:w1");
  });

  it("marks confirmed withdrawals as already sent (no double-send)", () => {
    expect(withdrawAlreadySent("CONFIRMED", "sig")).toBe(true);
    expect(withdrawAlreadySent("SENT", "sig")).toBe(true);
    expect(withdrawAlreadySent("CONFIRMED", null)).toBe(false);
    expect(withdrawAlreadySent("DEBITED", "sig")).toBe(false);
    expect(withdrawNeedsChainSend("DEBITED")).toBe(true);
    expect(withdrawNeedsChainSend("PENDING")).toBe(false);
  });
});
