-- Phase 2: deposit detection records + wallet scan cursor
CREATE TYPE "DepositStatus" AS ENUM ('SEEN', 'CREDITING', 'CREDITED', 'FAILED', 'IGNORED');

ALTER TABLE "SolWallet" ADD COLUMN "lastSignature" TEXT;
ALTER TABLE "SolWallet" ADD COLUMN "lastScannedAt" TIMESTAMP(3);

CREATE TABLE "Deposit" (
    "id" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "lamports" BIGINT NOT NULL,
    "lots" INTEGER NOT NULL,
    "status" "DepositStatus" NOT NULL DEFAULT 'SEEN',
    "commandId" TEXT,
    "slot" BIGINT,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creditedAt" TIMESTAMP(3),

    CONSTRAINT "Deposit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Deposit_signature_key" ON "Deposit"("signature");
CREATE UNIQUE INDEX "Deposit_commandId_key" ON "Deposit"("commandId");
CREATE INDEX "Deposit_userId_createdAt_idx" ON "Deposit"("userId", "createdAt");
CREATE INDEX "Deposit_status_createdAt_idx" ON "Deposit"("status", "createdAt");

ALTER TABLE "Deposit" ADD CONSTRAINT "Deposit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
