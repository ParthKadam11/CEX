import { NextRequest, NextResponse } from "next/server";
import { bffError, getAuthenticatedUserId } from "@/lib/backend";
import {
  getMarketMakerStatus,
  runMarketMakerTick,
} from "@/lib/sim/market-maker";

/**
 * Dev crowd / MM simulator — no extra process.
 * Client switch loops POST { action: "tick" }; each tick uses OMS + gateway CREDIT.
 */
export async function GET(request: NextRequest) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return bffError(request, 401, "UNAUTHORIZED");
  return NextResponse.json({ ok: true, ...getMarketMakerStatus() });
}

export async function POST(request: NextRequest) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return bffError(request, 401, "UNAUTHORIZED");

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    // empty body ok for tick
  }

  const action =
    typeof body === "object" &&
    body !== null &&
    "action" in body &&
    typeof (body as { action: unknown }).action === "string"
      ? (body as { action: string }).action
      : "tick";

  if (action === "status") {
    return NextResponse.json({ ok: true, ...getMarketMakerStatus() });
  }

  if (action !== "tick" && action !== "seed") {
    return bffError(request, 400, "INVALID_ACTION");
  }

  try {
    const result = await runMarketMakerTick();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "SIM_FAILED";
    return NextResponse.json(
      { error: { code: "SIM_FAILED", message } },
      { status: 502 },
    );
  }
}
