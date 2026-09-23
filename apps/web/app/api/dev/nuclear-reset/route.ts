import { NextRequest, NextResponse } from "next/server";
import { bffError, getAuthenticatedUserId } from "@/lib/backend";
import { runNuclearReset } from "@/lib/sim/nuclear-reset";

/**
 * Full wipe: book, engine balances, OMS orders, wallet balances,
 * Timescale history, Redis streams. Keeps Google User accounts.
 *
 * Allowed in non-production always; in production only when
 * ALLOW_NUCLEAR_RESET=true (PaperTrade / demo hosts).
 */
function nuclearResetAllowed(): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  return process.env.ALLOW_NUCLEAR_RESET === "true";
}

export async function POST(request: NextRequest) {
  if (!nuclearResetAllowed()) {
    return bffError(request, 403, "NUCLEAR_RESET_DISABLED");
  }

  const userId = await getAuthenticatedUserId();
  if (!userId) return bffError(request, 401, "UNAUTHORIZED");

  try {
    const result = await runNuclearReset();
    return NextResponse.json(result, { status: result.ok ? 200 : 207 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "NUCLEAR_RESET_FAILED";
    return NextResponse.json(
      { error: { code: "NUCLEAR_RESET_FAILED", message } },
      { status: 502 },
    );
  }
}
