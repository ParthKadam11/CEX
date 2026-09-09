import { DepositStatus, prisma } from "@cex/db";
import { createLogger } from "@cex/logger";
import type { CreditCommand } from "@cex/app-contracts";
import { depositCreditCommandId } from "@cex/solana";
import type { Redis } from "ioredis";
import type { WatcherConfig } from "./config.js";
import { shouldSkipDepositCredit } from "./idempotency.js";
import {
  listNewSignatures,
  lotsFromLamports,
  readInboundTransfer,
} from "./scan.js";
import { publishCredit, waitForCreditResult } from "./redis.js";
import { ORDERS_EVENTS_STREAM } from "@cex/app-contracts";

const log = createLogger("deposit-watcher");

export async function runScanCycle(
  redis: Redis,
  config: WatcherConfig,
): Promise<{ wallets: number; seen: number; credited: number }> {
  const wallets = await prisma.solWallet.findMany({
    select: {
      id: true,
      userId: true,
      publicKey: true,
      lastSignature: true,
    },
  });

  let seen = 0;
  let credited = 0;

  for (const wallet of wallets) {
    try {
      const result = await scanWallet(redis, config, wallet);
      seen += result.seen;
      credited += result.credited;
    } catch (error) {
      log.error("wallet scan failed", {
        userId: wallet.userId,
        publicKey: wallet.publicKey,
        error,
      });
    }
  }

  // Retry deposits stuck mid-flight.
  const pending = await prisma.deposit.findMany({
    where: { status: { in: [DepositStatus.SEEN, DepositStatus.CREDITING] } },
    orderBy: { createdAt: "asc" },
    take: 50,
  });
  for (const deposit of pending) {
    try {
      const ok = await creditDeposit(redis, config, deposit.id);
      if (ok) credited += 1;
    } catch (error) {
      log.error("deposit credit retry failed", {
        signature: deposit.signature,
        userId: deposit.userId,
        error,
      });
    }
  }

  return { wallets: wallets.length, seen, credited };
}

async function scanWallet(
  redis: Redis,
  config: WatcherConfig,
  wallet: {
    id: string;
    userId: string;
    publicKey: string;
    lastSignature: string | null;
  },
): Promise<{ seen: number; credited: number }> {
  const signatures = await listNewSignatures(
    wallet.publicKey,
    wallet.lastSignature,
  );
  let seen = 0;
  let credited = 0;
  let newest = wallet.lastSignature;

  for (const info of signatures) {
    newest = info.signature;
    const transfer = await readInboundTransfer(
      info.signature,
      wallet.publicKey,
      config.confirmations,
    );
    if (!transfer) continue;

    const lots = lotsFromLamports(transfer.lamports, config.minLots);
    const commandId = depositCreditCommandId(transfer.signature);

    try {
      await prisma.deposit.create({
        data: {
          signature: transfer.signature,
          userId: wallet.userId,
          publicKey: wallet.publicKey,
          lamports: BigInt(transfer.lamports),
          lots: lots > 0 ? lots : 0,
          slot: transfer.slot != null ? BigInt(transfer.slot) : null,
          status: lots > 0 ? DepositStatus.SEEN : DepositStatus.IGNORED,
          commandId: lots > 0 ? commandId : null,
          failureReason:
            lots > 0 ? null : `below min lots (${config.minLots})`,
        },
      });
      seen += 1;
      log.info("deposit seen", {
        userId: wallet.userId,
        signature: transfer.signature,
        lamports: transfer.lamports,
        lots,
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // Already recorded — continue cursor.
    }

    if (lots > 0) {
      const deposit = await prisma.deposit.findUnique({
        where: { signature: transfer.signature },
        select: { id: true, status: true },
      });
      if (
        deposit &&
        (deposit.status === DepositStatus.SEEN ||
          deposit.status === DepositStatus.CREDITING)
      ) {
        const ok = await creditDeposit(redis, config, deposit.id);
        if (ok) credited += 1;
      }
    }
  }

  await prisma.solWallet.update({
    where: { id: wallet.id },
    data: {
      lastSignature: newest,
      lastScannedAt: new Date(),
    },
  });

  return { seen, credited };
}

export async function creditDeposit(
  redis: Redis,
  config: WatcherConfig,
  depositId: string,
): Promise<boolean> {
  const deposit = await prisma.deposit.findUnique({ where: { id: depositId } });
  if (!deposit) return false;
  if (shouldSkipDepositCredit(deposit.status)) return false;
  if (deposit.lots < 1) {
    await prisma.deposit.update({
      where: { id: depositId },
      data: {
        status: DepositStatus.IGNORED,
        failureReason: "lots < 1",
      },
    });
    return false;
  }

  const commandId = deposit.commandId ?? depositCreditCommandId(deposit.signature);

  await prisma.deposit.update({
    where: { id: depositId },
    data: {
      status: DepositStatus.CREDITING,
      commandId,
      failureReason: null,
    },
  });

  const command: CreditCommand = {
    commandId,
    type: "CREDIT",
    userId: deposit.userId,
    asset: "SOL",
    amount: deposit.lots,
    market: "SOL-USD",
    requestId: commandId,
    timestamp: Date.now(),
  };

  const recentTail = await redis.xrevrange(
    ORDERS_EVENTS_STREAM,
    "+",
    "-",
    "COUNT",
    1,
  );
  const afterId =
    (recentTail as Array<[string, string[]]>)[0]?.[0] ?? "0-0";

  await publishCredit(redis, command);
  log.info("deposit credit published", {
    commandId,
    userId: deposit.userId,
    signature: deposit.signature,
    lots: deposit.lots,
  });

  const result = await waitForCreditResult(redis, commandId, 20_000, afterId);
  if (result.ok) {
    await prisma.deposit.update({
      where: { id: depositId },
      data: {
        status: DepositStatus.CREDITED,
        creditedAt: new Date(),
        failureReason: null,
      },
    });
    log.info("deposit credited", {
      commandId,
      userId: deposit.userId,
      signature: deposit.signature,
      lots: deposit.lots,
    });
    return true;
  }

  await prisma.deposit.update({
    where: { id: depositId },
    data: {
      status: DepositStatus.FAILED,
      failureReason: result.reason ?? "CREDIT_FAILED",
    },
  });
  log.warn("deposit credit failed", {
    commandId,
    userId: deposit.userId,
    signature: deposit.signature,
    error: result.reason,
  });
  return false;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}
