import { prisma, WithdrawalStatus } from "@cex/db";
import {
  assertDevnetOnly,
  decryptSecretKey,
  explorerTxUrl,
  getLamportsBalance,
  lotsToLamports,
  parsePublicKey,
  sendSol,
} from "@cex/solana";
import type { CreditCommand, DebitCommand } from "@cex/app-contracts";
import {
  createOrdersRedis,
  publishCommand,
  waitForCommandResult,
} from "@/lib/redis/orders";
import { engineGatewayHeaders, engineGatewayUrl } from "@/lib/backend";
import { SPOT_VENUE } from "@/lib/markets";
import {
  withdrawAlreadySent,
  withdrawDebitCommandId,
  withdrawNeedsChainSend,
  withdrawRefundCommandId,
} from "@/lib/solana/withdraw-idempotency";

/** Leave room for tx fees on the custodial deposit wallet. */
const FEE_RESERVE_LAMPORTS = 10_000;
const MAX_WITHDRAW_LOTS = 1_000;

export type WithdrawRequest = {
  userId: string;
  destination: string;
  lots: number;
  requestId?: string;
  /** Client retry key — same key never double-sends. */
  idempotencyKey?: string;
};

export type WithdrawResult = {
  id: string;
  status: WithdrawalStatus;
  lots: number;
  destination: string;
  signature: string | null;
  explorerUrl: string | null;
  failureReason: string | null;
};

export async function executeWithdraw(
  req: WithdrawRequest,
): Promise<WithdrawResult> {
  assertDevnetOnly();

  if (!Number.isInteger(req.lots) || req.lots < 1 || req.lots > MAX_WITHDRAW_LOTS) {
    throw new WithdrawError("INVALID_AMOUNT", "Lots must be a whole number 1–1000");
  }

  let destination: string;
  try {
    destination = parsePublicKey(req.destination);
  } catch {
    throw new WithdrawError("INVALID_DESTINATION", "Invalid Solana address");
  }

  const idempotencyKey = normalizeIdempotencyKey(req.idempotencyKey);

  if (idempotencyKey) {
    const existing = await prisma.withdrawal.findUnique({
      where: { idempotencyKey },
    });
    if (existing) {
      if (existing.userId !== req.userId) {
        throw new WithdrawError("IDEMPOTENCY_CONFLICT", "Idempotency key in use");
      }
      if (withdrawAlreadySent(existing.status, existing.signature)) {
        return toResult(existing.id);
      }
      if (
        existing.status === WithdrawalStatus.FAILED ||
        existing.destination !== destination ||
        existing.lots !== req.lots
      ) {
        throw new WithdrawError(
          "IDEMPOTENCY_CONFLICT",
          "Reuse a fresh idempotency key after a failed or changed withdraw",
        );
      }
      // Resume DEBITING / DEBITED / PENDING for the same key.
      return resumeWithdraw(existing.id, req);
    }
  }

  const wallet = await prisma.solWallet.findUnique({
    where: { userId: req.userId },
    select: {
      publicKey: true,
      encryptedPrivateKey: true,
    },
  });
  if (!wallet) {
    throw new WithdrawError("WALLET_MISSING", "Deposit wallet not found");
  }
  if (destination === wallet.publicKey) {
    throw new WithdrawError(
      "INVALID_DESTINATION",
      "Destination cannot be your deposit address",
    );
  }

  const available = await fetchAvailableSol(req.userId);
  if (available < req.lots) {
    throw new WithdrawError(
      "INSUFFICIENT_BALANCE",
      `Available ${available} SOL, need ${req.lots}`,
    );
  }

  const lamports = lotsToLamports(req.lots);
  const onChain = await getLamportsBalance(wallet.publicKey);
  if (onChain < lamports + FEE_RESERVE_LAMPORTS) {
    throw new WithdrawError(
      "INSUFFICIENT_ONCHAIN",
      `Custodial wallet needs ${req.lots} SOL + fees; on-chain has ${(onChain / 1e9).toFixed(4)} SOL`,
    );
  }

  let withdrawal;
  try {
    withdrawal = await prisma.withdrawal.create({
      data: {
        userId: req.userId,
        destination,
        lots: req.lots,
        lamports: BigInt(lamports),
        status: WithdrawalStatus.PENDING,
        idempotencyKey,
      },
    });
  } catch (error) {
    if (idempotencyKey && isUniqueViolation(error)) {
      const raced = await prisma.withdrawal.findUnique({
        where: { idempotencyKey },
      });
      if (raced && withdrawAlreadySent(raced.status, raced.signature)) {
        return toResult(raced.id);
      }
      if (raced) return resumeWithdraw(raced.id, req);
    }
    throw error;
  }

  return runWithdrawPipeline(withdrawal.id, req, wallet.encryptedPrivateKey);
}

async function resumeWithdraw(
  withdrawalId: string,
  req: WithdrawRequest,
): Promise<WithdrawResult> {
  const row = await prisma.withdrawal.findUniqueOrThrow({
    where: { id: withdrawalId },
  });
  if (withdrawAlreadySent(row.status, row.signature)) {
    return toResult(row.id);
  }

  const wallet = await prisma.solWallet.findUnique({
    where: { userId: req.userId },
    select: { encryptedPrivateKey: true },
  });
  if (!wallet) {
    throw new WithdrawError("WALLET_MISSING", "Deposit wallet not found");
  }

  return runWithdrawPipeline(row.id, req, wallet.encryptedPrivateKey);
}

async function runWithdrawPipeline(
  withdrawalId: string,
  req: WithdrawRequest,
  encryptedPrivateKey: string,
): Promise<WithdrawResult> {
  const row = await prisma.withdrawal.findUniqueOrThrow({
    where: { id: withdrawalId },
  });
  if (withdrawAlreadySent(row.status, row.signature)) {
    return toResult(row.id);
  }

  const debitCommandId =
    row.debitCommandId ?? withdrawDebitCommandId(withdrawalId);
  const redis = createOrdersRedis();

  try {
    if (!withdrawNeedsChainSend(row.status)) {
      await prisma.withdrawal.update({
        where: { id: withdrawalId },
        data: {
          status: WithdrawalStatus.DEBITING,
          debitCommandId,
        },
      });

      const debit: DebitCommand = {
        commandId: debitCommandId,
        type: "DEBIT",
        userId: req.userId,
        asset: "SOL",
        amount: req.lots,
        market: SPOT_VENUE.symbol,
        requestId: req.requestId,
        timestamp: Date.now(),
      };
      await publishCommand(redis, debit);
      const debitResult = await waitForCommandResult(
        redis,
        debitCommandId,
        "DEBIT_OK",
        "DEBIT_FAILED",
      );
      if (!debitResult.ok) {
        await prisma.withdrawal.update({
          where: { id: withdrawalId },
          data: {
            status: WithdrawalStatus.FAILED,
            failureReason: debitResult.reason ?? "DEBIT_FAILED",
          },
        });
        return toResult(withdrawalId);
      }

      await prisma.withdrawal.update({
        where: { id: withdrawalId },
        data: { status: WithdrawalStatus.DEBITED },
      });
    }

    // Re-check after debit: another concurrent retry may have sent already.
    const afterDebit = await prisma.withdrawal.findUniqueOrThrow({
      where: { id: withdrawalId },
    });
    if (withdrawAlreadySent(afterDebit.status, afterDebit.signature)) {
      return toResult(withdrawalId);
    }

    const secretKey = decryptSecretKey(encryptedPrivateKey);
    let signature: string;
    try {
      signature = await sendSol({
        fromSecretKey: secretKey,
        toAddress: row.destination,
        lamports: Number(row.lamports),
      });
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : "SEND_FAILED";
      await refundAndFail(redis, req, withdrawalId, req.lots, reason);
      return toResult(withdrawalId);
    }

    const now = new Date();
    await prisma.withdrawal.update({
      where: { id: withdrawalId },
      data: {
        status: WithdrawalStatus.CONFIRMED,
        signature,
        sentAt: now,
        confirmedAt: now,
      },
    });
    return toResult(withdrawalId);
  } finally {
    redis.disconnect();
  }
}

async function refundAndFail(
  redis: ReturnType<typeof createOrdersRedis>,
  req: WithdrawRequest,
  withdrawalId: string,
  lots: number,
  reason: string,
): Promise<void> {
  const refundCommandId = withdrawRefundCommandId(withdrawalId);
  const credit: CreditCommand = {
    commandId: refundCommandId,
    type: "CREDIT",
    userId: req.userId,
    asset: "SOL",
    amount: lots,
    market: SPOT_VENUE.symbol,
    requestId: req.requestId,
    timestamp: Date.now(),
  };

  try {
    await publishCommand(redis, credit);
    const refund = await waitForCommandResult(
      redis,
      refundCommandId,
      "CREDIT_OK",
      "CREDIT_FAILED",
    );
    await prisma.withdrawal.update({
      where: { id: withdrawalId },
      data: {
        status: WithdrawalStatus.FAILED,
        refundCommandId,
        failureReason: refund.ok
          ? reason
          : `${reason}; refund failed: ${refund.reason ?? "CREDIT_FAILED"}`,
      },
    });
  } catch (error) {
    await prisma.withdrawal.update({
      where: { id: withdrawalId },
      data: {
        status: WithdrawalStatus.FAILED,
        refundCommandId,
        failureReason: `${reason}; refund error: ${
          error instanceof Error ? error.message : String(error)
        }`,
      },
    });
  }
}

async function fetchAvailableSol(userId: string): Promise<number> {
  const response = await fetch(
    `${engineGatewayUrl}/markets/${encodeURIComponent(SPOT_VENUE.symbol)}/balances`,
    {
      headers: engineGatewayHeaders(userId),
      cache: "no-store",
    },
  );
  if (!response.ok) {
    throw new WithdrawError("BALANCE_UNAVAILABLE", "Could not read exchange balance");
  }
  const body = (await response.json()) as {
    balances?: Array<{ asset: string; available: number }>;
  };
  const row = (body.balances ?? []).find((b) => b.asset === "SOL");
  return row?.available ?? 0;
}

async function toResult(id: string): Promise<WithdrawResult> {
  const row = await prisma.withdrawal.findUniqueOrThrow({ where: { id } });
  return {
    id: row.id,
    status: row.status,
    lots: row.lots,
    destination: row.destination,
    signature: row.signature,
    explorerUrl: row.signature ? explorerTxUrl(row.signature) : null,
    failureReason: row.failureReason,
  };
}

function normalizeIdempotencyKey(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 128) {
    throw new WithdrawError("INVALID_IDEMPOTENCY_KEY", "Bad idempotency key");
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(trimmed)) {
    throw new WithdrawError("INVALID_IDEMPOTENCY_KEY", "Bad idempotency key");
  }
  return trimmed;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

export class WithdrawError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "WithdrawError";
  }
}
