import { NextRequest, NextResponse } from "next/server";
import { DepositStatus, prisma } from "@cex/db";
import { bffError, getAuthenticatedUserId } from "@/lib/backend";
import { explorerTxUrl } from "@cex/solana";

/**
 * Recent Devnet deposits for the signed-in user (pending + credited).
 */
export async function GET(request: NextRequest) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return bffError(request, 401, "UNAUTHORIZED");

  const limitRaw = Number(request.nextUrl.searchParams.get("limit") ?? 20);
  const limit =
    Number.isInteger(limitRaw) && limitRaw > 0 && limitRaw <= 100
      ? limitRaw
      : 20;

  const deposits = await prisma.deposit.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      signature: true,
      publicKey: true,
      lamports: true,
      lots: true,
      status: true,
      commandId: true,
      failureReason: true,
      createdAt: true,
      creditedAt: true,
    },
  });

  const pending = deposits.filter(
    (d) =>
      d.status === DepositStatus.SEEN ||
      d.status === DepositStatus.CREDITING,
  ).length;

  return NextResponse.json({
    ok: true,
    pending,
    deposits: deposits.map((d) => ({
      ...d,
      lamports: d.lamports.toString(),
      explorerUrl: explorerTxUrl(d.signature),
      createdAt: d.createdAt.toISOString(),
      creditedAt: d.creditedAt?.toISOString() ?? null,
    })),
  });
}
