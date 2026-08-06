-- Rename InrWallet → UsdWallet (simulated USD quote currency)
ALTER TABLE "InrWallet" RENAME TO "UsdWallet";

ALTER TABLE "User" RENAME COLUMN "inrWalletId" TO "usdWalletId";

ALTER INDEX "InrWallet_userId_key" RENAME TO "UsdWallet_userId_key";

ALTER TABLE "UsdWallet" RENAME CONSTRAINT "InrWallet_pkey" TO "UsdWallet_pkey";

ALTER TABLE "UsdWallet" RENAME CONSTRAINT "InrWallet_userId_fkey" TO "UsdWallet_userId_fkey";
