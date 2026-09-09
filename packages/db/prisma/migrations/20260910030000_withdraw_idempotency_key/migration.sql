-- Phase 5: withdraw client idempotency key (retry must not double-send)
ALTER TABLE "Withdrawal" ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "Withdrawal_idempotencyKey_key" ON "Withdrawal"("idempotencyKey");
