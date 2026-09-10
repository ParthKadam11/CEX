-- Remove Solana Devnet custodial deposit/withdraw tables
DROP TABLE IF EXISTS "Withdrawal";
DROP TABLE IF EXISTS "Deposit";
DROP TABLE IF EXISTS "SolWallet";

DROP TYPE IF EXISTS "WithdrawalStatus";
DROP TYPE IF EXISTS "DepositStatus";
