-- CreateTable
CREATE TABLE "OmsProcessedEvent" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "commandId" TEXT,
    "orderId" TEXT,
    "eventType" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OmsProcessedEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OmsProcessedEvent_eventId_key" ON "OmsProcessedEvent"("eventId");

-- CreateIndex
CREATE INDEX "OmsProcessedEvent_orderId_processedAt_idx" ON "OmsProcessedEvent"("orderId", "processedAt");
