-- AlterTable
ALTER TABLE "Order" ADD COLUMN "lastEngineSequence" INTEGER NOT NULL DEFAULT 0;

-- DropIndex
DROP INDEX "OrderFill_tradeId_key";

-- CreateIndex
CREATE UNIQUE INDEX "OrderFill_orderId_tradeId_key" ON "OrderFill"("orderId", "tradeId");

-- CreateTable
CREATE TABLE "CommandOutbox" (
    "id" TEXT NOT NULL,
    "commandId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommandOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CommandOutbox_commandId_key" ON "CommandOutbox"("commandId");

-- CreateIndex
CREATE INDEX "CommandOutbox_publishedAt_createdAt_idx" ON "CommandOutbox"("publishedAt", "createdAt");
