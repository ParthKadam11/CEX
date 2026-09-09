-- Phase 0/1 Solana custodial deposit wallets:
-- encrypt secrets at rest; drop unused User.solWalletId; stamp createdAt.
ALTER TABLE "SolWallet" RENAME COLUMN "privateKey" TO "encryptedPrivateKey";
ALTER TABLE "SolWallet" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE UNIQUE INDEX "SolWallet_publicKey_key" ON "SolWallet"("publicKey");
ALTER TABLE "User" DROP COLUMN IF EXISTS "solWalletId";
