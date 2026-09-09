import { NextRequest, NextResponse } from "next/server";
import { prisma, WithdrawalStatus } from "@cex/db";
import { explorerTxUrl } from "@cex/solana";
import { bffError, getAuthenticatedUserId } from "@/lib/backend";

/**
 * Recent Devnet withdrawals for the signed-in user.
 */
export async function GET(request: NextRequest) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return bffError(request, 401, "UNAUTHORIZED");

  const limitRaw = Number(request.nextUrl.searchParams.get("limit") ?? 20);
  const limit =
    Number.isInteger(limitRaw) && limitRaw > 0 && limitRaw <= 100
      ? limitRaw
      : 20;

  const withdrawals = await prisma.withdrawal.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      destination: true,
      lots: true,
      lamports: true,
      status: true,
      signature: true,
      failureReason: true,
      createdAt: true,
      sentAt: true,
      confirmedAt: true,
    },
  });

  const pending = withdrawals.filter(
    (w) =>
      w.status === WithdrawalStatus.PENDING ||
      w.status === WithdrawalStatus.DEBITING ||
      w.status === WithdrawalStatus.DEBITED ||
      w.status === WithdrawalStatus.SENT,
  ).length;

  return NextResponse.json({
    ok: true,
    pending,
    withdrawals: withdrawals.map((w) => ({
      ...w,
      lamports: w.lamports.toString(),
      explorerUrl: w.signature ? explorerTxUrl(w.signature) : null,
      createdAt: w.createdAt.toISOString(),
      sentAt: w.sentAt?.toISOString() ?? null,
      confirmedAt: w.confirmedAt?.toISOString() ?? null,
    })),
  });
}
