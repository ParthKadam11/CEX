-- CreateEnum
CREATE TYPE "OrderSide" AS ENUM ('BUY', 'SELL');

-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('LIMIT', 'MARKET');

-- CreateEnum
CREATE TYPE "OrderTimeInForce" AS ENUM ('GTC', 'IOC', 'FOK', 'FOK_BUDGET');

-- CreateEnum
CREATE TYPE "OmsOrderStatus" AS ENUM ('PENDING', 'ACCEPTED', 'OPEN', 'PARTIALLY_FILLED', 'FILLED', 'CANCEL_REQUESTED', 'CANCELLED', 'REJECTED', 'FAILED');

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "engineOrderId" TEXT NOT NULL,
    "placeCommandId" TEXT NOT NULL,
    "cancelCommandId" TEXT,
    "clientOrderId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "side" "OrderSide" NOT NULL,
    "type" "OrderType" NOT NULL,
    "timeInForce" "OrderTimeInForce" NOT NULL,
    "price" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "quoteBudget" INTEGER,
    "filledQuantity" INTEGER NOT NULL DEFAULT 0,
    "status" "OmsOrderStatus" NOT NULL DEFAULT 'PENDING',
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderFill" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "tradeId" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderFill_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Order_engineOrderId_key" ON "Order"("engineOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_placeCommandId_key" ON "Order"("placeCommandId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_cancelCommandId_key" ON "Order"("cancelCommandId");

-- CreateIndex
CREATE INDEX "Order_userId_createdAt_idx" ON "Order"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Order_userId_status_idx" ON "Order"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Order_userId_clientOrderId_key" ON "Order"("userId", "clientOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderFill_tradeId_key" ON "OrderFill"("tradeId");

-- CreateIndex
CREATE INDEX "OrderFill_orderId_createdAt_idx" ON "OrderFill"("orderId", "createdAt");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderFill" ADD CONSTRAINT "OrderFill_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
