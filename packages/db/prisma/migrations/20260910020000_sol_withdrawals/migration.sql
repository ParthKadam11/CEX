-- Phase 4: SOL withdrawals (engine debit → Devnet send)
CREATE TYPE "WithdrawalStatus" AS ENUM ('PENDING', 'DEBITING', 'DEBITED', 'SENT', 'CONFIRMED', 'FAILED');

CREATE TABLE "Withdrawal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "lots" INTEGER NOT NULL,
    "lamports" BIGINT NOT NULL,
    "status" "WithdrawalStatus" NOT NULL DEFAULT 'PENDING',
    "debitCommandId" TEXT,
    "refundCommandId" TEXT,
    "signature" TEXT,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),

    CONSTRAINT "Withdrawal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Withdrawal_debitCommandId_key" ON "Withdrawal"("debitCommandId");
CREATE UNIQUE INDEX "Withdrawal_refundCommandId_key" ON "Withdrawal"("refundCommandId");
CREATE UNIQUE INDEX "Withdrawal_signature_key" ON "Withdrawal"("signature");
CREATE INDEX "Withdrawal_userId_createdAt_idx" ON "Withdrawal"("userId", "createdAt");
CREATE INDEX "Withdrawal_status_createdAt_idx" ON "Withdrawal"("status", "createdAt");

ALTER TABLE "Withdrawal" ADD CONSTRAINT "Withdrawal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
