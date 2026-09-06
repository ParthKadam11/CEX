-- Drop legacy paper UsdWallet (engine BalanceStore is authoritative).
DROP TABLE IF EXISTS "UsdWallet";

ALTER TABLE "User" DROP COLUMN IF EXISTS "usdWalletId";
