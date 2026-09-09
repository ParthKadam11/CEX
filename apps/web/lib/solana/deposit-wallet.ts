import { prisma as db } from "@cex/db";
import {
  assertDevnetOnly,
  createKeypair,
  encryptSecretKey,
  explorerAddressUrl,
  faucetUrl,
  explorerCluster,
} from "@cex/solana";

export type DepositAddressInfo = {
  publicKey: string;
  cluster: "devnet" | "testnet" | "mainnet-beta";
  explorerUrl: string;
  faucetUrl: string | null;
  createdAt: string;
};

/**
 * Ensure the user has a custodial Devnet deposit keypair.
 * Secrets are encrypted with SOLANA_WALLET_MASTER_KEY before insert.
 */
export async function ensureDepositWallet(
  userId: string,
): Promise<DepositAddressInfo> {
  assertDevnetOnly();

  const existing = await db.solWallet.findUnique({
    where: { userId },
    select: { publicKey: true, createdAt: true },
  });
  if (existing) {
    return toInfo(existing.publicKey, existing.createdAt);
  }

  const keypair = createKeypair();
  const encryptedPrivateKey = encryptSecretKey(keypair.secretKey);

  try {
    const created = await db.solWallet.create({
      data: {
        userId,
        publicKey: keypair.publicKey,
        encryptedPrivateKey,
      },
      select: { publicKey: true, createdAt: true },
    });
    return toInfo(created.publicKey, created.createdAt);
  } catch (error) {
    // Unique race: another request created the wallet first.
    if (!isUniqueViolation(error)) throw error;
    const raced = await db.solWallet.findUnique({
      where: { userId },
      select: { publicKey: true, createdAt: true },
    });
    if (!raced) throw error;
    return toInfo(raced.publicKey, raced.createdAt);
  }
}

function toInfo(publicKey: string, createdAt: Date): DepositAddressInfo {
  const cluster = explorerCluster();
  return {
    publicKey,
    cluster,
    explorerUrl: explorerAddressUrl(publicKey, cluster),
    faucetUrl: faucetUrl(cluster),
    createdAt: createdAt.toISOString(),
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}
