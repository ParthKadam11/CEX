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

/** Leave room for tx fees on the custodial deposit wallet. */
const FEE_RESERVE_LAMPORTS = 10_000;
const MAX_WITHDRAW_LOTS = 1_000;

export type WithdrawRequest = {
  userId: string;
  destination: string;
  lots: number;
  requestId?: string;
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

  const withdrawal = await prisma.withdrawal.create({
    data: {
      userId: req.userId,
      destination,
      lots: req.lots,
      lamports: BigInt(lamports),
      status: WithdrawalStatus.PENDING,
    },
  });

  const debitCommandId = `withdraw:${withdrawal.id}`;
  const redis = createOrdersRedis();

  try {
    await prisma.withdrawal.update({
      where: { id: withdrawal.id },
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
        where: { id: withdrawal.id },
        data: {
          status: WithdrawalStatus.FAILED,
          failureReason: debitResult.reason ?? "DEBIT_FAILED",
        },
      });
      return toResult(withdrawal.id);
    }

    await prisma.withdrawal.update({
      where: { id: withdrawal.id },
      data: { status: WithdrawalStatus.DEBITED },
    });

    const secretKey = decryptSecretKey(wallet.encryptedPrivateKey);
    let signature: string;
    try {
      signature = await sendSol({
        fromSecretKey: secretKey,
        toAddress: destination,
        lamports,
      });
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : "SEND_FAILED";
      await refundAndFail(redis, req, withdrawal.id, req.lots, reason);
      return toResult(withdrawal.id);
    }

    const now = new Date();
    await prisma.withdrawal.update({
      where: { id: withdrawal.id },
      data: {
        status: WithdrawalStatus.CONFIRMED,
        signature,
        sentAt: now,
        confirmedAt: now,
      },
    });
    return toResult(withdrawal.id);
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
  const refundCommandId = `withdraw-refund:${withdrawalId}`;
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

export class WithdrawError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "WithdrawError";
  }
}
