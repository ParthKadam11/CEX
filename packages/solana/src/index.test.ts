import { describe, expect, it } from "vitest";
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
} from "../src/index.js";

describe("@cex/solana wallet primitives", () => {
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
});
