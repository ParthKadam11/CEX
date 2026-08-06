import { Keypair } from "@solana/web3.js";

/** Persist secret keys as base64 (64 bytes). */
export function serializeSecretKey(secretKey: Uint8Array): string {
  return Buffer.from(secretKey).toString("base64");
}

/**
 * Load a keypair from DB storage.
 * Supports base64 (current) and legacy comma-separated Uint8Array.toString().
 */
export function keypairFromStoredSecret(stored: string): Keypair {
  const trimmed = stored.trim();

  if (trimmed.startsWith("[")) {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(trimmed) as number[]));
  }

  if (trimmed.includes(",")) {
    return Keypair.fromSecretKey(
      Uint8Array.from(trimmed.split(",").map((n) => Number(n.trim()))),
    );
  }

  const buf = Buffer.from(trimmed, "base64");
  if (buf.length === 64) {
    return Keypair.fromSecretKey(buf);
  }

  throw new Error("Unrecognized private key format");
}
