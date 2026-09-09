import { DepositStatus } from "@cex/db";

/** True when creditDeposit should no-op (already applied or ignored). */
export function shouldSkipDepositCredit(status: DepositStatus): boolean {
  return (
    status === DepositStatus.CREDITED || status === DepositStatus.IGNORED
  );
}
