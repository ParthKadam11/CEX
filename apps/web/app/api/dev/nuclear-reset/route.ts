import { NextRequest, NextResponse } from "next/server";
import { bffError, getAuthenticatedUserId } from "@/lib/backend";
import { runNuclearReset } from "@/lib/sim/nuclear-reset";

/**
 * Dev-only full wipe: book, engine balances, OMS orders, wallet balances,
 * Timescale history, Redis streams. Keeps Google User accounts.
 */
export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return bffError(request, 404, "NOT_FOUND");
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
