import { NextRequest, NextResponse } from "next/server";
import { bffError, getAuthenticatedUserId } from "@/lib/backend";
import {
  executeWithdraw,
  WithdrawError,
} from "@/lib/solana/withdraw";

/**
 * Debit exchange SOL then send Devnet SOL from the custodial deposit wallet.
 * Body: { destination: string, lots: number }
 */
export async function POST(request: NextRequest) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return bffError(request, 401, "UNAUTHORIZED");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return bffError(request, 400, "INVALID_JSON");
  }

  if (!isRecord(body)) {
    return bffError(request, 400, "INVALID_BODY");
  }

  const destination =
    typeof body.destination === "string" ? body.destination : "";
  const lots = Number(body.lots ?? body.amount);

  try {
    const result = await executeWithdraw({
      userId,
      destination,
      lots,
      requestId: request.headers.get("x-request-id") ?? undefined,
    });

    if (result.status === "FAILED") {
      return NextResponse.json(
        {
          ok: false,
          ...result,
          error: {
            code: "WITHDRAW_FAILED",
            message: result.failureReason ?? "WITHDRAW_FAILED",
          },
        },
        { status: 502 },
      );
    }

    return NextResponse.json({ ok: true, ...result }, { status: 200 });
  } catch (error) {
    if (error instanceof WithdrawError) {
      const status =
        error.code === "INSUFFICIENT_BALANCE" ||
        error.code === "INSUFFICIENT_ONCHAIN" ||
        error.code === "INVALID_AMOUNT" ||
        error.code === "INVALID_DESTINATION"
          ? 400
          : 502;
      return bffError(request, status, error.code, error.message);
    }
    const message = error instanceof Error ? error.message : "WITHDRAW_FAILED";
    if (message.includes("SOLANA_WALLET_MASTER_KEY")) {
      return bffError(request, 502, "WALLET_KEY_MISSING", message);
    }
    if (
      message.includes("SOLANA_MAINNET_FORBIDDEN") ||
      message.includes("SOLANA_DEVNET_REQUIRED")
    ) {
      return bffError(request, 502, "SOLANA_NETWORK_FORBIDDEN", message);
    }
    return bffError(request, 502, "WITHDRAW_FAILED", message);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
