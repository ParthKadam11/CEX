import { NextRequest, NextResponse } from "next/server";
import { bffError, getAuthenticatedUserId } from "@/lib/backend";
import { ensureDepositWallet } from "@/lib/solana/deposit-wallet";

/**
 * Custodial Devnet deposit address for the signed-in user.
 * Creates + encrypts a keypair on first call.
 */
export async function GET(request: NextRequest) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return bffError(request, 401, "UNAUTHORIZED");

  try {
    const wallet = await ensureDepositWallet(userId);
    return NextResponse.json({ ok: true, ...wallet });
  } catch (error) {
    const message = error instanceof Error ? error.message : "WALLET_FAILED";
    if (message.includes("SOLANA_WALLET_MASTER_KEY")) {
      return bffError(request, 502, "WALLET_KEY_MISSING", message);
    }
    if (
      message.includes("SOLANA_MAINNET_FORBIDDEN") ||
      message.includes("SOLANA_DEVNET_REQUIRED")
    ) {
      return bffError(request, 502, "SOLANA_NETWORK_FORBIDDEN", message);
    }
    return bffError(request, 502, "WALLET_FAILED", message);
  }
}
